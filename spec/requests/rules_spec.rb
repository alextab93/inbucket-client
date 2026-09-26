require "rails_helper"
require "socket"
require "stringio"

RSpec.describe "Rules", type: :request do
  around do |example|
    original_token = ENV["LUA_EVENT_TOKEN"]
    original_path = ENV["LUA_SCRIPT_PATH"]
    original_compiler = ENV["LUA_COMPILER"]
    ENV["LUA_EVENT_TOKEN"] = "a" * 48
    ENV["LUA_SCRIPT_PATH"] = Rails.root.join("tmp", "notification-rules-#{Process.pid}.lua").to_s
    example.run
  ensure
    ENV["LUA_EVENT_TOKEN"] = original_token
    ENV["LUA_SCRIPT_PATH"] = original_path
    ENV["LUA_COMPILER"] = original_compiler
  end

  it "requires an authenticated session for notification configuration" do
    get "/v1/rules"

    expect(response).to have_http_status(:unauthorized)
    expect(response.parsed_body).to eq("error" => "unauthorized")
  end

  it "creates a versioned metadata rule and rejects unsupported free-form fields" do
    authenticate

    post "/v1/rules", params: rule_payload.merge(
      name: "  Order notices  ",
      conditions: rule_payload.fetch(:conditions).merge(senders: ["SALES@EXAMPLE.COM"]),
      actions: rule_payload.fetch(:actions).merge(star: true, mark_read: true),
    ).to_json, headers: json_headers

    expect(response).to have_http_status(:created)
    created = response.parsed_body
    expect(created).to include("name" => "Order notices", "schema_version" => 4)
    expect(created.dig("conditions", "senders")).to eq(["sales@example.com"])
    expect(created.dig("actions", "destination_ids")).to eq([])
    expect(created.fetch("actions")).to include("star" => true, "mark_read" => true)

    post "/v1/rules", params: rule_payload.merge(
      name: "Unsafe",
      conditions: rule_payload.fetch(:conditions).merge(script: "os.execute('x')"),
    ).to_json, headers: json_headers

    expect(response).to have_http_status(:unprocessable_content)
    expect(response.parsed_body.fetch("error")).to eq("invalid_rule")
    expect(MessageRule.where(name: "Unsafe")).to be_empty
  end

  it "creates a rule with no match conditions for every new message" do
    user = authenticate

    post "/v1/rules", params: rule_payload.merge(
      name: "Every new message",
      conditions: {
        mailboxes: [],
        senders: [],
        recipients: [],
        tag_ids: [],
        time_windows: []
      }
    ).to_json, headers: json_headers

    expect(response).to have_http_status(:created)
    expect(response.parsed_body.fetch("conditions")).to eq(
      "mailboxes" => [],
      "senders" => [],
      "recipients" => [],
      "tag_ids" => [],
      "time_windows" => []
    )
    expect(user.message_rules.find_by!(name: "Every new message").human_summary).to start_with("When any message matches")
  end

  it "previews useful recent indexed metadata without exposing message bodies" do
    authenticate
    matching = index_message(mailbox: "orders", id: "one", from: "sales@example.com", subject: "Invoice ready", size: 320)
    index_message(mailbox: "orders", id: "two", from: "other@example.com", subject: "Invoice ready", size: 320)

    post "/v1/rules/preview", params: rule_payload.merge(
      conditions: rule_payload.fetch(:conditions).merge(senders: ["sales@example.com"]),
    ).to_json, headers: json_headers

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch("matches")).to eq([
      "mailbox" => matching.mailbox,
      "message_id" => matching.message_id,
      "subject" => "Invoice ready",
      "sender" => "sales@example.com",
      "recipients" => ["recipient@example.com"],
      "received_at" => "2026-09-24T12:00:00.000000Z",
      "size" => 320,
    ])
    expect(response.body).not_to include("raw source", "message body")
  end

  it "previews conditions without validating the rule name or actions" do
    user = authenticate
    user.message_rules.create!(rule_payload)
    matching = index_message(mailbox: "orders", id: "preview-only", from: "sales@example.com", subject: "Invoice ready", size: 320)

    post "/v1/rules/preview", params: {
      name: "Alert",
      enabled: true,
      actions: { in_app: false, browser: false, destination_ids: [], star: false, mark_read: false, tag_ids: [], move_to_trash: false },
      conditions: { senders: ["sales@example.com"] }
    }.to_json, headers: json_headers

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch("matches")).to include(
      include("message_id" => matching.message_id)
    )
  end

  it "creates exactly one durable delivery per rule event and disables email when SMTP is disabled" do
    user = authenticate
    destination = email_destination(user)
    rule = user.message_rules.create!(rule_payload.merge(name: "Order alert", cooldown_seconds: 0, actions: rule_payload.fetch(:actions).merge(destination_ids: [destination.id])))
    message = index_message(mailbox: "orders", id: "invoice-1", from: "sales@example.com", subject: "Invoice", size: 320)

    MessageRuleEvaluator.new(message:).call
    MessageRuleEvaluator.new(message:).call

    deliveries = NotificationDelivery.where(message_rule: rule).order(:kind, :recipient)
    expect(deliveries.map { |delivery| [delivery.kind, delivery.status, delivery.recipient] }).to eq([
      ["email", "disabled", "Admin email (email)"],
      ["in_app", "delivered", nil],
    ])
    expect(deliveries.pluck(:message_id).uniq).to eq(["invoice-1"])
  end

  it "does not deliver non-matching events or events within a rule cooldown" do
    user = authenticate
    rule = user.message_rules.create!(rule_payload.merge(name: "Cool alert", cooldown_seconds: 300))
    matching = index_message(mailbox: "orders", id: "invoice-cool-1", from: "sales@example.com", subject: "Invoice", size: 320)
    non_matching = index_message(mailbox: "support", id: "invoice-cool-2", from: "sales@example.com", subject: "Invoice", size: 320)
    cooled_down = index_message(mailbox: "orders", id: "invoice-cool-3", from: "sales@example.com", subject: "Invoice", size: 320)

    MessageRuleEvaluator.new(message: matching).call
    MessageRuleEvaluator.new(message: non_matching).call
    MessageRuleEvaluator.new(message: cooled_down).call

    expect(NotificationDelivery.where(message_rule: rule).pluck(:message_id).uniq).to eq(["invoice-cool-1"])
  end

  it "runs multiple message actions for one matching rule" do
    user = authenticate
    tag = user.tags.create!(name: "Orders", color: "#1D4ED8")
    rule = user.message_rules.create!(rule_payload.merge(
      name: "Organize orders",
      cooldown_seconds: 0,
      actions: {
        in_app: false,
        browser: false,
        destination_ids: [],
        star: true,
        mark_read: true,
        tag_ids: [tag.id],
        move_to_trash: true
      }
    ))
    message = index_message(mailbox: "orders", id: "invoice-actions", from: "sales@example.com", subject: "Invoice", size: 320)
    stub_request(:patch, "http://inbucket.test:9000/api/v1/mailbox/orders/invoice-actions")
      .with(body: '{"seen":true}')
      .to_return(status: 204, body: "")

    MessageRuleEvaluator.new(message:).call

    expect(user.starred_messages.exists?(inbucket_message: message)).to be(true)
    expect(tag.message_tags.exists?(inbucket_message: message)).to be(true)
    expect(message.reload.seen).to be(true)
    expect(user.trashed_messages.exists?(inbucket_message: message)).to be(true)
    expect(NotificationDelivery.where(message_rule: rule)).to be_empty
  end

  it "applies cooldown to rules without notification actions" do
    user = authenticate
    rule = user.message_rules.create!(rule_payload.merge(
      name: "Star first order",
      cooldown_seconds: 300,
      actions: {
        in_app: false,
        browser: false,
        destination_ids: [],
        star: true,
        mark_read: false,
        tag_ids: []
      }
    ))
    first = index_message(mailbox: "orders", id: "invoice-star-first", from: "sales@example.com", subject: "Invoice", size: 320)
    second = index_message(mailbox: "orders", id: "invoice-star-second", from: "sales@example.com", subject: "Invoice", size: 320)

    MessageRuleEvaluator.new(message: first).call
    MessageRuleEvaluator.new(message: second).call

    expect(user.starred_messages.pluck(:inbucket_message_id)).to eq([first.id])
    expect(NotificationDelivery.where(message_rule: rule)).to be_empty
  end

  it "rejects action tags owned by another user" do
    user = authenticate
    other_user = User.create!(username: "other-admin", password: "correct horse battery staple")
    foreign_tag = other_user.tags.create!(name: "Private", color: "#1D4ED8")

    post "/v1/rules", params: rule_payload.merge(
      name: "Foreign tag action",
      actions: rule_payload.fetch(:actions).merge(tag_ids: [foreign_tag.id])
    ).to_json, headers: json_headers

    expect(response).to have_http_status(:unprocessable_content)
    expect(response.parsed_body).to include("error" => "invalid_rule")
    expect(user.message_rules.where(name: "Foreign tag action")).to be_empty
  end

  it "removes a deleted action tag and disables a rule with no remaining action" do
    user = authenticate
    tag = user.tags.create!(name: "Temporary", color: "#1D4ED8")
    rule = user.message_rules.create!(rule_payload.merge(
      name: "Temporary tag action",
      actions: {
        in_app: false,
        browser: false,
        destination_ids: [],
        star: false,
        mark_read: false,
        tag_ids: [tag.id]
      }
    ))

    tag.destroy!

    expect(rule.reload.action_tag_ids).to eq([])
    expect(rule).not_to be_enabled
  end

  it "matches every supported metadata condition" do
    user = authenticate
    tag = user.tags.create!(name: "Orders", color: "#1D4ED8")
    destination = email_destination(user)
    rule = user.message_rules.create!(rule_payload.merge(
      name: "Complete condition alert",
      cooldown_seconds: 0,
      conditions: {
        mailboxes: ["orders"],
        senders: ["sales@example.com"],
        recipients: ["recipient@example.com"],
        subject: "invoice",
        minimum_size: 300,
        maximum_size: 400,
        has_attachments: true,
        tag_ids: [tag.id],
        time_windows: [{ days: [4], start: "11:00", finish: "13:00" }]
      },
      actions: rule_payload.fetch(:actions).merge(destination_ids: [destination.id])
    ))
    message = index_message(mailbox: "orders", id: "invoice-complete", from: "sales@example.com", subject: "Invoice ready", size: 320)
    tag.message_tags.create!(inbucket_message: message)

    MessageRuleEvaluator.new(
      message:,
      now: Time.utc(2026, 9, 24, 12, 0, 0),
      attachment_lookup: ->(_message) { true }
    ).call

    expect(NotificationDelivery.where(message_rule: rule).pluck(:kind).sort).to eq(["email", "in_app"])
  end

  it "matches the after-midnight part of a time window on the following UTC day" do
    user = authenticate
    rule = user.message_rules.create!(rule_payload.merge(
      name: "Overnight orders",
      cooldown_seconds: 0,
      conditions: rule_payload.fetch(:conditions).merge(
        time_windows: [{ days: [1], start: "23:00", finish: "01:00" }]
      )
    ))
    monday_night = index_message(mailbox: "orders", id: "overnight-monday", from: "sales@example.com", subject: "Invoice", size: 320)
    tuesday_early = index_message(mailbox: "orders", id: "overnight-tuesday", from: "sales@example.com", subject: "Invoice", size: 320)
    monday_early = index_message(mailbox: "orders", id: "overnight-monday-early", from: "sales@example.com", subject: "Invoice", size: 320)

    MessageRuleEvaluator.new(message: monday_night, now: Time.utc(2026, 9, 21, 23, 30, 0)).call
    MessageRuleEvaluator.new(message: tuesday_early, now: Time.utc(2026, 9, 22, 0, 30, 0)).call
    MessageRuleEvaluator.new(message: monday_early, now: Time.utc(2026, 9, 21, 0, 30, 0)).call

    expect(NotificationDelivery.where(message_rule: rule).pluck(:message_id).sort).to eq([
      "overnight-monday",
      "overnight-tuesday"
    ])
  end

  it "stops queued email when a rule is disabled" do
    user = authenticate
    rule = user.message_rules.create!(rule_payload.merge(name: "Queued alert"))
    message = index_message(mailbox: "orders", id: "invoice-2", from: "sales@example.com", subject: "Invoice", size: 320)
    delivery = NotificationDelivery.enqueue!(
      rule:,
      message:,
      kind: "email",
      recipient: "admin@example.com",
      status: "retrying",
      next_attempt_at: Time.current,
    )

    rule.update!(enabled: false)

    expect(delivery.reload.status).to eq("disabled")
    expect(delivery.next_attempt_at).to be_nil
  end

  it "does not create deliveries for a stored event after its rule is disabled" do
    user = authenticate
    rule = user.message_rules.create!(rule_payload.merge(name: "Disabled future alert"))
    rule.update!(enabled: false)
    message = index_message(mailbox: "orders", id: "invoice-disabled", from: "sales@example.com", subject: "Invoice", size: 320)

    MessageRuleEvaluator.new(message:).call

    expect(NotificationDelivery.where(message_rule: rule)).to be_empty
  end

  it "keeps generated Lua private and accepts only its configured event token" do
    user = authenticate
    user.message_rules.create!(rule_payload.merge(name: "Lua alert"))

    get "/v1/rules"

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch("lua").fetch("desired_revision")).to eq(RuleLuaScript.revision)
    expect(response.body).not_to include("source")
    expect(response.body).not_to include("a" * 48)

    post "/v1/internal/rule-events", params: { mailbox: "orders", id: "invoice-3", revision: RuleLuaScript.revision }.to_json, headers: json_headers.merge("X-Inbucket-Event-Token" => "wrong")

    expect(response).to have_http_status(:unauthorized)

    post "/v1/internal/rule-events", params: { mailbox: "orders", id: "invoice-3", revision: RuleLuaScript.revision }.to_json, headers: json_headers.merge("X-Inbucket-Event-Token" => "a" * 48)

    expect(response).to have_http_status(:accepted)
    expect(RuleLuaState.order(:id).first.active_revision).to eq(RuleLuaScript.revision)
  end

  it "keeps the current Lua source when validation is unavailable" do
    File.write(ENV.fetch("LUA_SCRIPT_PATH"), "last known good")
    ENV["LUA_COMPILER"] = "missing-lua-compiler"
    authenticate

    post "/v1/rules", params: rule_payload.merge(name: "Protected Lua alert").to_json, headers: json_headers

    expect(response).to have_http_status(:created)
    expect { RuleLuaScript.write! }.to raise_error(RuleLuaScript::Unavailable)
    expect(File.read(ENV.fetch("LUA_SCRIPT_PATH"))).to eq("last known good")
    expect(RuleLuaState.order(:id).first.last_error_code).to eq("lua_validation_unavailable")

    get "/v1/rules"

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch("lua").fetch("last_error_code")).to eq("lua_validation_unavailable")
  end

  it "records disabled delivery without attempting SMTP work" do
    user = User.create!(username: "delivery-admin", password: "correct horse battery staple")
    rule = user.message_rules.create!(rule_payload.merge(name: "Delivery alert"))
    message = index_message(mailbox: "orders", id: "invoice-4", from: "sales@example.com", subject: "Invoice", size: 320)
    delivery = NotificationDelivery.enqueue!(
      rule:,
      message:,
      kind: "email",
      recipient: "admin@example.com",
      status: "pending",
      next_attempt_at: Time.current,
    )

    NotificationDeliveryWorker.new(
      delivery,
      configuration: NotificationSmtpConfiguration.new(state: "disabled"),
    ).deliver

    expect(delivery.reload.status).to eq("disabled")
    expect(delivery.delivered_at).to be_nil
  end

  it "disables email delivery when its destination no longer exists" do
    user = authenticate
    destination = email_destination(user)
    rule = user.message_rules.create!(rule_payload.merge(name: "Removed destination alert"))
    message = index_message(mailbox: "orders", id: "invoice-removed-destination", from: "sales@example.com", subject: "Invoice", size: 320)
    delivery = NotificationDelivery.enqueue!(
      rule:,
      message:,
      kind: "email",
      destination:,
      recipient: destination.delivery_label("email"),
      status: "pending",
      next_attempt_at: Time.current,
    )
    destination.destroy!
    configuration = NotificationSmtpConfiguration.new(
      state: "ready",
      host: "127.0.0.1",
      port: "1",
      from: "notifications@example.com",
      security: "starttls",
    )

    NotificationDeliveryWorker.new(delivery.reload, configuration:).deliver

    expect(delivery.reload).to have_attributes(status: "disabled", error_code: nil)
  end

  it "delivers a bounded notification email through SMTP" do
    user = authenticate
    rule = user.message_rules.create!(rule_payload.merge(name: "SMTP alert"))
    message = index_message(mailbox: "orders", id: "invoice-smtp", from: "sales@example.com", subject: "Invoice confidential body", size: 320)
    delivery = NotificationDelivery.enqueue!(
      rule:,
      message:,
      kind: "email",
      recipient: "admin@example.com",
      status: "pending",
      next_attempt_at: Time.current,
    )
    smtp = smtp_recorder

    claimed = NotificationDelivery.claim_due
    NotificationDeliveryWorker.new(claimed, configuration: smtp.fetch(:configuration)).deliver

    expect(delivery.reload.status).to eq("delivered")
    received = smtp.fetch(:body).pop
    expect(received).to include("Mailbox: orders", "Message: invoice-smtp")
    expect(received).not_to include("Invoice confidential body")
  ensure
    smtp&.fetch(:thread)&.join(2)
  end

  it "retries an SMTP transport failure with a generic visible error" do
    user = authenticate
    rule = user.message_rules.create!(rule_payload.merge(name: "SMTP failure alert"))
    message = index_message(mailbox: "orders", id: "invoice-smtp-failure", from: "sales@example.com", subject: "Invoice", size: 320)
    delivery = NotificationDelivery.enqueue!(
      rule:,
      message:,
      kind: "email",
      recipient: "admin@example.com",
      status: "pending",
      next_attempt_at: Time.current,
    )
    smtp = smtp_rejector

    claimed = NotificationDelivery.claim_due
    NotificationDeliveryWorker.new(claimed, configuration: smtp.fetch(:configuration)).deliver

    expect(delivery.reload.status).to eq("retrying")
    expect(delivery.error_code).to eq("delivery_failed")
    expect(delivery.next_attempt_at).to be_within(5.seconds).of(1.minute.from_now)
  ensure
    smtp&.fetch(:thread)&.join(2)
  end

  it "keeps SMTP credentials and message content out of notification output" do
    user = authenticate
    rule = user.message_rules.create!(rule_payload.merge(name: "Private SMTP alert"))
    message = index_message(mailbox: "orders", id: "invoice-private", from: "sales@example.com", subject: "Confidential invoice content", size: 320)
    delivery = NotificationDelivery.enqueue!(
      rule:,
      message:,
      kind: "email",
      recipient: "admin@example.com",
      status: "pending",
      next_attempt_at: Time.current,
    )
    secret = "smtp-secret-for-test"
    smtp = smtp_recorder(username: "smtp-user", password: secret)
    log = StringIO.new
    original_rails_logger = Rails.logger
    original_record_logger = ActiveRecord::Base.logger
    Rails.logger = ActiveSupport::Logger.new(log)
    ActiveRecord::Base.logger = Rails.logger

    claimed = NotificationDelivery.claim_due
    NotificationDeliveryWorker.new(claimed, configuration: smtp.fetch(:configuration)).deliver
    received = smtp.fetch(:body).pop
    get "/v1/notifications"

    expect(delivery.reload.status).to eq("delivered")
    expect(received).not_to include(secret, "Confidential invoice content")
    expect(response.body).not_to include(secret, "Confidential invoice content")
    expect(log.string).not_to include(secret, "Confidential invoice content")
  ensure
    Rails.logger = original_rails_logger if original_rails_logger
    ActiveRecord::Base.logger = original_record_logger if original_record_logger
    smtp&.fetch(:thread)&.join(2)
  end

  it "lets an enabled rule safely queue a disabled delivery after SMTP is configured" do
    user = authenticate
    rule = user.message_rules.create!(rule_payload.merge(name: "Retry alert"))
    message = index_message(mailbox: "orders", id: "invoice-5", from: "sales@example.com", subject: "Invoice", size: 320)
    delivery = NotificationDelivery.enqueue!(
      rule:,
      message:,
      kind: "email",
      recipient: "admin@example.com",
      status: "disabled",
    )

    patch "/v1/notifications/#{delivery.id}/retry", headers: json_headers

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).to include("status" => "retrying", "error_code" => nil)
    expect(delivery.reload.next_attempt_at).to be_present
  end

  it "keeps disabled SMTP delivery visible in the notification center" do
    user = authenticate
    rule = user.message_rules.create!(rule_payload.merge(name: "Visible disabled alert"))
    message = index_message(mailbox: "orders", id: "invoice-6", from: "sales@example.com", subject: "Invoice", size: 320)
    NotificationDelivery.enqueue!(
      rule:,
      message:,
      kind: "email",
      recipient: "admin@example.com",
      status: "disabled",
    )

    get "/v1/notifications"

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).to include(a_hash_including("status" => "disabled", "recipient" => "admin@example.com"))
  end

  it "prunes expired terminal outbound delivery records" do
    user = authenticate
    rule = user.message_rules.create!(rule_payload.merge(name: "Retention alert"))
    old_deliveries = %w[email ntfy webhook].map do |kind|
      old_message = index_message(mailbox: "orders", id: "invoice-old-#{kind}", from: "sales@example.com", subject: "Invoice", size: 320)
      delivery = NotificationDelivery.enqueue!(rule:, message: old_message, kind:, recipient: "Expired #{kind}", status: "delivered", delivered_at: Time.current)
      delivery.update_columns(created_at: 31.days.ago, updated_at: 31.days.ago)
      delivery
    end
    new_message = index_message(mailbox: "orders", id: "invoice-new", from: "sales@example.com", subject: "Invoice", size: 320)

    NotificationDelivery.enqueue!(
      rule:,
      message: new_message,
      kind: "in_app",
      status: "delivered",
      delivered_at: Time.current,
    )

    expect(NotificationDelivery.where(id: old_deliveries.map(&:id))).to be_empty
  end

  it "defers every outbound method after the global one-minute limit" do
    user = authenticate
    rule = user.message_rules.create!(rule_payload.merge(name: "Rate alert"))
    63.times do |index|
      message = index_message(mailbox: "orders", id: "invoice-rate-#{index}", from: "sales@example.com", subject: "Invoice", size: 320)
      NotificationDelivery.enqueue!(
        rule:,
        message:,
        kind: %w[email ntfy webhook][index % 3],
        recipient: "Outbound target #{index}",
        status: "pending",
        next_attempt_at: Time.current,
      )
    end
    attempted_kinds = 60.times.map do
      delivery = NotificationDelivery.claim_due
      delivery.mark_failed!("delivery_failed")
      delivery.kind
    end

    expect(attempted_kinds.tally).to eq("email" => 20, "ntfy" => 20, "webhook" => 20)
    expect(NotificationDelivery.claim_due).to be_nil
    expect(NotificationDelivery.where(message_rule: rule, status: "pending").pluck(:kind).sort).to eq(%w[email ntfy webhook])
  end

  it "keeps destinations scoped to the authenticated user" do
    user = authenticate
    other_user = User.create!(username: "other-admin", password: "correct horse battery staple")
    other_destination = other_user.notification_destinations.create!(
      name: "Other ntfy",
      methods: [{ kind: "ntfy", host: "https://ntfy.example.com", topic: "private-topic" }]
    )

    post "/v1/notification_destinations", params: {
      name: "Operations",
      methods: [{ kind: "ntfy", host: "https://ntfy.example.com/", topic: "operations" }]
    }.to_json, headers: json_headers

    expect(response).to have_http_status(:created)
    expect(response.parsed_body).to include("name" => "Operations")

    get "/v1/notification_destinations"

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch("destinations").pluck("name")).to eq(["Operations"])
    expect(user.notification_destinations.find_by!(name: "Operations").methods).to eq([
      "kind" => "ntfy", "host" => "https://ntfy.example.com", "topic" => "operations"
    ])

    post "/v1/rules", params: rule_payload.merge(
      name: "Foreign destination",
      actions: rule_payload.fetch(:actions).merge(destination_ids: [other_destination.id])
    ).to_json, headers: json_headers

    expect(response).to have_http_status(:unprocessable_content)
    expect(response.parsed_body).to include("error" => "invalid_rule")
    expect(user.message_rules.where(name: "Foreign destination")).to be_empty
  end

  it "returns the most recently updated saved ntfy host and webhook URL" do
    user = authenticate
    older = user.notification_destinations.create!(
      name: "Older endpoints",
      methods: [
        { kind: "ntfy", host: "https://ntfy.old.example.com", topic: "old" },
        { kind: "webhook", url: "https://hooks.old.example.com/inbucket", method: "POST", headers: [], body: "" }
      ]
    )
    recent_ntfy = user.notification_destinations.create!(
      name: "Recent ntfy",
      methods: [{ kind: "ntfy", host: "https://ntfy.recent.example.com", topic: "alerts" }]
    )
    recent_webhook = user.notification_destinations.create!(
      name: "Recent webhook",
      methods: [{ kind: "webhook", url: "https://hooks.recent.example.com/inbucket", method: "PATCH", headers: [], body: "" }]
    )
    older.update_column(:updated_at, Time.utc(2026, 9, 22))
    recent_ntfy.update_column(:updated_at, Time.utc(2026, 9, 23))
    recent_webhook.update_column(:updated_at, Time.utc(2026, 9, 24))

    get "/v1/notification_destinations"

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch("defaults")).to eq(
      "ntfy_host" => "https://ntfy.recent.example.com",
      "webhook_url" => "https://hooks.recent.example.com/inbucket"
    )
  end

  it "keeps a saved ntfy token private while retaining it after a blank edit" do
    user = authenticate
    destination = user.notification_destinations.create!(
      name: "Protected ntfy",
      methods: [{ kind: "ntfy", host: "https://ntfy.example.com", topic: "alerts", token: "tk_saved" }]
    )

    patch "/v1/notification_destinations/#{destination.id}", params: {
      name: "Protected ntfy",
      methods: [{ kind: "ntfy", host: "https://ntfy.example.com", topic: "updated-alerts", token: "" }]
    }.to_json, headers: json_headers

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).to eq(
      "id" => destination.id,
      "name" => "Protected ntfy",
      "methods" => [{ "kind" => "ntfy", "host" => "https://ntfy.example.com", "topic" => "updated-alerts" }]
    )
    expect(destination.reload.methods).to eq([
      "kind" => "ntfy", "host" => "https://ntfy.example.com", "topic" => "updated-alerts", "token" => "tk_saved"
    ])
  end

  it "sends safe test notifications through every configured destination method" do
    user = authenticate
    destination = user.notification_destinations.create!(
      name: "Operations",
      methods: [
        { kind: "email", recipients: ["admin@example.com"] },
        { kind: "ntfy", host: "https://ntfy.example.com", topic: "operations", token: "tk_test" },
        { kind: "webhook", url: "https://hooks.example.com/inbucket?token=private", method: "POST", headers: [], body: "" }
      ]
    )
    ntfy_request = stub_request(:post, "https://ntfy.example.com/operations").with(
      headers: {
        "Title" => "Inbucket test notification",
        "Authorization" => "Bearer tk_test"
      }
    ).to_return(status: 200)
    webhook_request = stub_request(:post, "https://hooks.example.com/inbucket?token=private").with { |request|
      JSON.parse(request.body) == {
        "event" => "inbucket.notification.test",
        "destination" => "Operations",
        "method" => "webhook",
        "test" => true
      }
    }.to_return(status: 204)
    smtp = smtp_recorder(from: "Inbucket <notifications@example.com>")
    configuration = smtp.fetch(:configuration)
    smtp_keys = %w[
      OUTBOUND_SMTP_ENABLED
      OUTBOUND_SMTP_HOST
      OUTBOUND_SMTP_PORT
      OUTBOUND_SMTP_USERNAME
      OUTBOUND_SMTP_PASSWORD
      OUTBOUND_SMTP_FROM
      OUTBOUND_SMTP_SECURITY
    ]
    original_smtp = smtp_keys.to_h { |key| [key, ENV[key]] }
    ENV["OUTBOUND_SMTP_ENABLED"] = "true"
    ENV["OUTBOUND_SMTP_HOST"] = configuration.host
    ENV["OUTBOUND_SMTP_PORT"] = configuration.port
    ENV["OUTBOUND_SMTP_USERNAME"] = configuration.username
    ENV["OUTBOUND_SMTP_PASSWORD"] = configuration.password
    ENV["OUTBOUND_SMTP_FROM"] = configuration.from
    ENV["OUTBOUND_SMTP_SECURITY"] = configuration.security

    expect do
      post "/v1/notification_destinations/#{destination.id}/test", params: { kind: "ntfy" }.to_json, headers: json_headers
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to eq("kind" => "ntfy", "message" => "Test ntfy notification sent.")

      post "/v1/notification_destinations/#{destination.id}/test", params: { kind: "webhook" }.to_json, headers: json_headers
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to eq("kind" => "webhook", "message" => "Test Webhook notification sent.")

      post "/v1/notification_destinations/#{destination.id}/test", params: { kind: "email" }.to_json, headers: json_headers
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to eq("kind" => "email", "message" => "Test Email notification sent.")
    end.not_to change(NotificationDelivery, :count)

    received = smtp.fetch(:body).pop
    expect(ntfy_request).to have_been_requested.once
    expect(webhook_request).to have_been_requested.once
    expect(received).to include(
      "From: Inbucket <notifications@example.com>",
      "Subject: Inbucket test notification",
      "This is a test from Inbucket for Operations.",
      "Delivery method: email"
    )
  ensure
    original_smtp&.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
    smtp&.fetch(:thread)&.join(2)
  end

  it "reports a generic destination test failure without exposing configuration" do
    user = authenticate
    destination = user.notification_destinations.create!(
      name: "Private hook",
      methods: [{ kind: "webhook", url: "https://hooks.example.com/fail?token=private", method: "POST", headers: [{ name: "Authorization", value: "private-header" }], body: "private-body" }]
    )
    stub_request(:post, "https://hooks.example.com/fail?token=private").to_return(status: 500)

    post "/v1/notification_destinations/#{destination.id}/test", params: { kind: "webhook" }.to_json, headers: json_headers

    expect(response).to have_http_status(:bad_gateway)
    expect(response.parsed_body).to eq("error" => "test_delivery_failed")
    expect(response.body).not_to include("private", "hooks.example.com")

    post "/v1/notification_destinations/#{destination.id}/test", params: { kind: "email" }.to_json, headers: json_headers

    expect(response).to have_http_status(:unprocessable_content)
    expect(response.parsed_body).to eq("error" => "invalid_delivery_method")
  end

  it "reports when ntfy rejects a test without publish permission" do
    user = authenticate
    destination = user.notification_destinations.create!(
      name: "Protected ntfy",
      methods: [{ kind: "ntfy", host: "https://ntfy.example.com", topic: "protected" }]
    )
    stub_request(:post, "https://ntfy.example.com/protected").to_return(status: 403)

    post "/v1/notification_destinations/#{destination.id}/test", params: { kind: "ntfy" }.to_json, headers: json_headers

    expect(response).to have_http_status(:bad_gateway)
    expect(response.parsed_body).to eq("error" => "ntfy_forbidden")
  end

  it "filters destination configuration from request logging" do
    authenticate

    post "/v1/notification_destinations", params: {
      name: "Private automation",
      methods: [{
        kind: "webhook",
        url: "https://hooks.example.com/inbucket?credential=private-url",
        method: "POST",
        headers: [{ name: "Authorization", value: "private-header" }],
        body: "private-body"
      }]
    }.to_json, headers: json_headers

    filtered = request.filtered_parameters.to_json
    expect(response).to have_http_status(:created)
    expect(filtered).to include("[FILTERED]")
    expect(filtered).not_to include("private-url", "private-header", "private-body", "hooks.example.com")
  end

  it "removes a deleted destination from rules and queued deliveries" do
    user = authenticate
    destination = email_destination(user)
    rule = user.message_rules.create!(rule_payload.merge(
      name: "Destination cleanup",
      actions: { in_app: false, browser: false, destination_ids: [destination.id] }
    ))
    message = index_message(mailbox: "orders", id: "destination-cleanup", from: "sales@example.com", subject: "Invoice", size: 320)
    delivery = NotificationDelivery.enqueue!(rule:, message:, kind: "email", destination:, recipient: destination.delivery_label("email"), status: "pending", next_attempt_at: Time.current)

    delete "/v1/notification_destinations/#{destination.id}", headers: json_headers

    expect(response).to have_http_status(:no_content)
    expect(rule.reload.destination_ids).to eq([])
    expect(rule).not_to be_enabled
    expect(delivery.reload).to have_attributes(notification_destination: nil, status: "disabled")
  end

  it "rejects malformed ntfy and webhook destinations before delivery" do
    authenticate

    post "/v1/notification_destinations", params: {
      name: "Invalid ntfy",
      methods: [{ kind: "ntfy", host: "file:///tmp/notify", topic: "bad/topic" }]
    }.to_json, headers: json_headers

    expect(response).to have_http_status(:unprocessable_content)
    expect(response.parsed_body).to include("error" => "invalid_notification_destination")

    post "/v1/notification_destinations", params: {
      name: "Invalid webhook",
      methods: [{ kind: "webhook", url: "https://user:secret@example.com/hook", method: "TRACE", headers: [{ name: "Host", value: "evil.example" }], body: "secret" }]
    }.to_json, headers: json_headers

    expect(response).to have_http_status(:unprocessable_content)

    post "/v1/notification_destinations", params: {
      name: "Invalid webhook fragment",
      methods: [{ kind: "webhook", url: "https://hooks.example.com/path#fragment", method: "POST", headers: [{ name: "X-Test", value: "one\r\ntwo" }], body: "" }]
    }.to_json, headers: json_headers

    expect(response).to have_http_status(:unprocessable_content)

    post "/v1/notification_destinations", params: {
      name: "Invalid webhook header",
      methods: [{ kind: "webhook", url: "https://hooks.example.com/path", method: "POST", headers: [{ name: "X-Test", value: "one\r\ntwo" }], body: "" }]
    }.to_json, headers: json_headers

    expect(response).to have_http_status(:unprocessable_content)
    expect(NotificationDestination.where(name: ["Invalid ntfy", "Invalid webhook", "Invalid webhook fragment", "Invalid webhook header"])).to be_empty
    expect(WebMock).not_to have_requested(:any, /.+/)
  end

  it "creates one delivery for every selected destination method without duplicates" do
    user = authenticate
    destination = user.notification_destinations.create!(
      name: "Operations",
      methods: [
        { kind: "email", recipients: ["admin@example.com"] },
        { kind: "ntfy", host: "https://ntfy.example.com", topic: "operations" },
        { kind: "webhook", url: "https://hooks.example.com/inbucket", method: "POST", headers: [], body: "" }
      ]
    )
    secondary = user.notification_destinations.create!(
      name: "Security",
      methods: [{ kind: "email", recipients: ["security@example.com"] }]
    )
    rule = user.message_rules.create!(rule_payload.merge(
      name: "Every channel",
      cooldown_seconds: 0,
      actions: { in_app: true, browser: true, destination_ids: [destination.id, secondary.id] }
    ))
    message = index_message(mailbox: "orders", id: "every-channel", from: "sales@example.com", subject: "Invoice", size: 320)

    MessageRuleEvaluator.new(message:).call
    MessageRuleEvaluator.new(message:).call

    expect(NotificationDelivery.where(message_rule: rule).order(:kind).pluck(:kind, :recipient)).to eq([
      ["browser", nil],
      ["email", "Operations (email)"],
      ["email", "Security (email)"],
      ["in_app", nil],
      ["ntfy", "Operations (ntfy)"],
      ["webhook", "Operations (webhook)"]
    ])
  end

  it "delivers safe ntfy and webhook payloads through their configured boundaries" do
    user = authenticate
    ntfy_destination = user.notification_destinations.create!(
      name: "Phone",
      methods: [{ kind: "ntfy", host: "https://ntfy.example.com", topic: "alerts" }]
    )
    webhook_destination = user.notification_destinations.create!(
      name: "Automation",
      methods: [{
        kind: "webhook",
        url: "https://hooks.example.com/inbucket?token=private",
        method: "PATCH",
        headers: [{ name: "Authorization", value: "Bearer private-token" }],
        body: "{\"source\":\"inbucket\"}"
      }]
    )
    rule = user.message_rules.create!(rule_payload.merge(name: "Outbound alert", cooldown_seconds: 0))
    message = index_message(mailbox: "orders", id: "outbound-safe", from: "sales@example.com", subject: "Confidential body text", size: 320)
    ntfy = NotificationDelivery.enqueue!(rule:, message:, kind: "ntfy", destination: ntfy_destination, recipient: ntfy_destination.delivery_label("ntfy"), status: "pending", next_attempt_at: Time.current)
    webhook = NotificationDelivery.enqueue!(rule:, message:, kind: "webhook", destination: webhook_destination, recipient: webhook_destination.delivery_label("webhook"), status: "pending", next_attempt_at: Time.current)
    ntfy_request = stub_request(:post, "https://ntfy.example.com/alerts").to_return(status: 200)
    webhook_request = stub_request(:patch, "https://hooks.example.com/inbucket?token=private").with(
      headers: { "Authorization" => "Bearer private-token" },
      body: "{\"source\":\"inbucket\"}"
    ).to_return(status: 204)

    NotificationDeliveryWorker.new(ntfy).deliver
    NotificationDeliveryWorker.new(webhook).deliver

    expect(ntfy.reload.status).to eq("delivered")
    expect(webhook.reload.status).to eq("delivered")
    expect(ntfy_request).to have_been_requested.once
    expect(webhook_request).to have_been_requested.once
    expect(ntfy_request.with { |request| !request.body.include?("Confidential body text") }).to have_been_requested.once
  end

  it "retries outbound failures with a generic visible error and no secret leakage" do
    user = authenticate
    destination = user.notification_destinations.create!(
      name: "Failing hook",
      methods: [{ kind: "webhook", url: "https://hooks.example.com/fail?token=private", method: "POST", headers: [{ name: "Authorization", value: "private-token" }], body: "private-body" }]
    )
    rule = user.message_rules.create!(rule_payload.merge(name: "Retry webhook"))
    message = index_message(mailbox: "orders", id: "webhook-failure", from: "sales@example.com", subject: "Confidential", size: 320)
    delivery = NotificationDelivery.enqueue!(rule:, message:, kind: "webhook", destination:, recipient: destination.delivery_label("webhook"), status: "pending", next_attempt_at: Time.current)
    stub_request(:post, "https://hooks.example.com/fail?token=private").to_return(status: 500)
    log = StringIO.new
    original_rails_logger = Rails.logger
    original_record_logger = ActiveRecord::Base.logger
    Rails.logger = ActiveSupport::Logger.new(log)
    ActiveRecord::Base.logger = Rails.logger

    NotificationDeliveryWorker.new(delivery).deliver
    get "/v1/notifications"
    output = response.body
    get "/v1/rules"

    expect(delivery.reload).to have_attributes(status: "retrying", error_code: "delivery_failed")
    expect(output).not_to include("private-token", "private-body", "token=private")
    expect(response.body).not_to include("private-token", "private-body", "token=private", "hooks.example.com")
    expect(log.string).not_to include("private-token", "private-body", "token=private", "hooks.example.com")
  ensure
    Rails.logger = original_rails_logger if original_rails_logger
    ActiveRecord::Base.logger = original_record_logger if original_record_logger
  end

  it "keeps an ntfy failure visible and eligible for retry" do
    user = authenticate
    destination = user.notification_destinations.create!(
      name: "Failing ntfy",
      methods: [{ kind: "ntfy", host: "https://ntfy.example.com", topic: "alerts" }]
    )
    rule = user.message_rules.create!(rule_payload.merge(name: "Retry ntfy"))
    message = index_message(mailbox: "orders", id: "ntfy-failure", from: "sales@example.com", subject: "Invoice", size: 320)
    delivery = NotificationDelivery.enqueue!(rule:, message:, kind: "ntfy", destination:, recipient: destination.delivery_label("ntfy"), status: "pending", next_attempt_at: Time.current)
    stub_request(:post, "https://ntfy.example.com/alerts").to_return(status: 500)

    NotificationDeliveryWorker.new(delivery).deliver
    get "/v1/notifications"

    expect(delivery.reload).to have_attributes(status: "retrying", error_code: "delivery_failed")
    expect(response.parsed_body).to include(a_hash_including("id" => delivery.id, "status" => "retrying", "error_code" => "delivery_failed"))
  end

  it "stops webhook retries after three failed attempts" do
    user = authenticate
    destination = user.notification_destinations.create!(
      name: "Bounded hook",
      methods: [{ kind: "webhook", url: "https://hooks.example.com/fail", method: "POST", headers: [], body: "" }]
    )
    rule = user.message_rules.create!(rule_payload.merge(name: "Bounded retries"))
    message = index_message(mailbox: "orders", id: "bounded-retries", from: "sales@example.com", subject: "Invoice", size: 320)
    delivery = NotificationDelivery.enqueue!(rule:, message:, kind: "webhook", destination:, recipient: destination.delivery_label("webhook"), status: "pending", next_attempt_at: Time.current)
    stub_request(:post, "https://hooks.example.com/fail").to_return(status: 500)

    3.times do
      claimed = NotificationDelivery.claim_due
      NotificationDeliveryWorker.new(claimed).deliver
      delivery.update!(next_attempt_at: Time.current) if delivery.reload.status == "retrying"
    end

    expect(delivery.reload).to have_attributes(status: "failed", attempt_count: 3, next_attempt_at: nil, error_code: "delivery_failed")
  end

  it "keeps indexing mail and exposes a generic rule failure" do
    user = authenticate
    rule = user.message_rules.create!(rule_payload.merge(name: "Malformed alert"))
    rule.update_column(:conditions, { "mailboxes" => 1 })

    InbucketMonitor.record(
      JSON.generate(
        "variant" => "message-stored",
        "header" => {
          "mailbox" => "orders",
          "id" => "invoice-malformed",
          "from" => "sales@example.com",
          "to" => ["recipient@example.com"],
          "subject" => "Invoice",
          "size" => 320,
          "date" => "2026-09-24T12:00:00Z"
        }
      )
    )

    expect(InbucketMessage.find_by(mailbox: "orders", message_id: "invoice-malformed")).to be_present
    expect(rule.reload.last_error_code).to eq("no_method_error")
  end

  def authenticate
    user = User.create!(username: "admin", password: "correct horse battery staple")
    post "/v1/session", params: { username: user.username, password: "correct horse battery staple" }.to_json, headers: json_headers
    expect(response).to have_http_status(:ok)
    user
  end

  def json_headers
    { "CONTENT_TYPE" => "application/json" }
  end

  def rule_payload
    {
      name: "Alert",
      enabled: true,
      priority: 10,
      cooldown_seconds: 60,
      schema_version: 4,
      conditions: {
        mailboxes: ["orders"],
        senders: [],
        recipients: [],
        tag_ids: [],
        time_windows: [],
      },
      actions: {
        in_app: true,
        browser: false,
        destination_ids: [],
        star: false,
        mark_read: false,
        tag_ids: [],
        move_to_trash: false,
      },
    }
  end

  def email_destination(user, name: "Admin email")
    user.notification_destinations.create!(
      name:,
      methods: [{ kind: "email", recipients: ["admin@example.com"] }]
    )
  end

  def index_message(mailbox:, id:, from:, subject:, size:)
    Mailbox.record(mailbox)
    InbucketMessage.record(
      {
        mailbox:,
        id:,
        from:,
        to: ["recipient@example.com"],
        subject:,
        size:,
        date: "2026-09-24T12:00:00Z",
      },
      source: :scan,
    )
  end

  def smtp_recorder(username: nil, password: nil, from: "notifications@example.com")
    server = TCPServer.new("127.0.0.1", 0)
    body = Queue.new
    thread = Thread.new do
      client = server.accept
      client.write("220 localhost SMTP\r\n")
      collecting = false
      content = []
      while (line = client.gets)
        if collecting
          if line == ".\r\n"
            client.write("250 accepted\r\n")
            body << content.join
            collecting = false
          else
            content << line
          end
        elsif line.start_with?("EHLO")
          client.write("250-localhost\r\n250-AUTH PLAIN\r\n250 OK\r\n")
        elsif line.start_with?("AUTH PLAIN")
          client.write("235 authenticated\r\n")
        elsif line.start_with?("DATA")
          client.write("354 continue\r\n")
          collecting = true
        elsif line.start_with?("QUIT")
          client.write("221 closing\r\n")
          break
        else
          client.write("250 ok\r\n")
        end
      end
    ensure
      client&.close
      server.close
    end
    { body:, configuration: smtp_configuration(server.addr[1], username:, password:, from:), thread: }
  end

  def smtp_rejector
    server = TCPServer.new("127.0.0.1", 0)
    thread = Thread.new do
      client = server.accept
      client.write("421 unavailable\r\n")
      client.close
    ensure
      server.close
    end
    { configuration: smtp_configuration(server.addr[1]), thread: }
  end

  def smtp_configuration(port, username: nil, password: nil, from: "notifications@example.com")
    NotificationSmtpConfiguration.new(
      state: "ready",
      host: "127.0.0.1",
      port:,
      username:,
      password:,
      from:,
      security: "starttls",
    )
  end
end
