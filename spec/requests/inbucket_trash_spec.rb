require "rails_helper"

RSpec.describe "Inbucket trash", type: :request do
  let(:mailbox) { "orders" }
  let(:header) do
    {
      mailbox:,
      id: "invoice",
      from: "billing@example.com",
      to: ["alex@example.com"],
      subject: "August invoice",
      date: "2026-08-27T12:00:00Z",
      size: 300,
      seen: false
    }
  end

  it "requires a private session" do
    get "/v1/inbucket/trash/messages"

    expect(response).to have_http_status(:unauthorized)
    expect(response.parsed_body).to eq("error" => "unauthorized")
  end

  it "moves only the signed-in user's message to Trash without changing its star or read state" do
    user = authenticate
    other_user = User.create!(username: "other", password: "password-123")
    message = index_message(header)
    StarredMessage.create!(user:, inbucket_message: message)
    StarredMessage.create!(user: other_user, inbucket_message: message)

    patch "/v1/inbucket/mailboxes/#{mailbox}/messages/invoice/trashed",
          params: { trashed: true }.to_json,
          headers: json_headers

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).to include("trashed" => true)
    expect(response.parsed_body.fetch("message")).to include(
      "mailbox" => mailbox,
      "id" => "invoice",
      "starred" => true,
      "seen" => false,
      "available" => true
    )
    expect(user.trashed_messages.count).to eq(1)
    expect(other_user.trashed_messages.count).to eq(0)
    expect(user.starred_messages.count).to eq(1)
    expect(other_user.starred_messages.count).to eq(1)
    expect(message.reload.seen).to be(false)

    get "/v1/inbucket/messages", params: { mailboxes: [mailbox] }
    expect(response.parsed_body.fetch("messages")).to be_empty

    get "/v1/inbucket/starred/messages"
    expect(response.parsed_body).to be_empty
  end

  it "restores an available message without removing its star" do
    user = authenticate
    message = index_message(header)
    StarredMessage.create!(user:, inbucket_message: message)
    TrashedMessage.create!(user:, inbucket_message: message, trashed_at: Time.current)

    patch "/v1/inbucket/mailboxes/#{mailbox}/messages/invoice/trashed",
          params: { trashed: false }.to_json,
          headers: json_headers

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).to eq("trashed" => false, "available" => true)
    expect(user.trashed_messages).to be_empty
    expect(user.starred_messages.count).to eq(1)

    get "/v1/inbucket/messages", params: { mailboxes: [mailbox] }
    expect(response.parsed_body.fetch("messages").first).to include("id" => "invoice", "starred" => true)
  end

  it "renders missing upstream messages as unavailable until tombstone cleanup" do
    user = authenticate
    message = index_message(header)
    trash = TrashedMessage.create!(user:, inbucket_message: message, trashed_at: Time.current)
    message.mark_unavailable!

    get "/v1/inbucket/trash/messages"

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch("messages").first).to include(
      "id" => "invoice",
      "available" => false
    )
    expect(TrashedMessage.find_by(id: trash.id)).to be_present

    message.update!(unavailable_at: 8.days.ago)
    InbucketMessage.reconcile_snapshot(mailbox, [])

    expect(TrashedMessage.find_by(id: trash.id)).to be_nil
    expect(InbucketMessage.find_by(id: message.id)).to be_nil
  end

  it "filters and sorts Trash across mailboxes" do
    user = authenticate
    values = [
      header.merge(id: "small-unread", subject: "Invoice small", size: 100, seen: false),
      header.merge(id: "large-unread", subject: "Invoice large", size: 900, seen: false),
      header.merge(mailbox: "support", id: "other", subject: "Other", size: 1_000, seen: false),
      header.merge(id: "read", subject: "Invoice read", size: 2_000, seen: true)
    ]
    values.each do |value|
      message = index_message(value)
      TrashedMessage.create!(user:, inbucket_message: message, trashed_at: Time.current)
    end

    get "/v1/inbucket/trash/messages",
        params: { search: "invoice", read: "unread", mailbox:, sort: "largest" }

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch("messages").map { |item| item.fetch("id") }).to eq(
      %w[large-unread small-unread]
    )
    expect(response.parsed_body.fetch("total_count")).to eq(2)
  end

  it "permanently deletes a message and all derived metadata only after upstream success" do
    user = authenticate
    other_user = User.create!(username: "other", password: "password-123")
    message = index_message(header, source: :monitor)
    tag = Tag.create!(user:, name: "Finance", color: "#1D4ED8")
    tag.message_tags.create!(inbucket_message: message)
    StarredMessage.create!(user:, inbucket_message: message)
    TrashedMessage.create!(user:, inbucket_message: message, trashed_at: Time.current)
    TrashedMessage.create!(user: other_user, inbucket_message: message, trashed_at: Time.current)
    stub_request(:delete, "http://inbucket.test:9000/api/v1/mailbox/#{mailbox}/invoice")
      .to_return(status: 200, body: '"OK"', headers: { "Content-Type" => "application/json" })

    delete "/v1/inbucket/message", params: { name: mailbox, id: "invoice" }

    expect(response).to have_http_status(:no_content)
    expect(InbucketMessage.find_by(id: message.id)).to be_nil
    expect(StarredMessage.where(inbucket_message_id: message.id)).to be_empty
    expect(TrashedMessage.where(inbucket_message_id: message.id)).to be_empty
    expect(tag.reload.message_tags).to be_empty
  end

  it "preserves every item after upstream rejects permanent deletion" do
    user = authenticate
    message = index_message(header, source: :monitor)
    StarredMessage.create!(user:, inbucket_message: message)
    trash = TrashedMessage.create!(user:, inbucket_message: message, trashed_at: Time.current)
    stub_request(:delete, "http://inbucket.test:9000/api/v1/mailbox/#{mailbox}/invoice")
      .to_return(status: 500, body: "failed")

    delete "/v1/inbucket/message", params: { name: mailbox, id: "invoice" }

    expect(response).to have_http_status(:bad_gateway)
    expect(InbucketMessage.find_by(id: message.id)).to be_present
    expect(StarredMessage.find_by(inbucket_message: message)).to be_present
    expect(TrashedMessage.find_by(id: trash.id)).to be_present
  end

  it "reports one result per item and preserves only failures after emptying Trash" do
    user = authenticate
    deleted = index_message(header.merge(id: "deleted"))
    failed = index_message(header.merge(id: "failed"))
    TrashedMessage.create!(user:, inbucket_message: deleted, trashed_at: 1.minute.ago)
    TrashedMessage.create!(user:, inbucket_message: failed, trashed_at: Time.current)
    stub_request(:delete, "http://inbucket.test:9000/api/v1/mailbox/#{mailbox}/deleted")
      .to_return(status: 204, body: "")
    stub_request(:delete, "http://inbucket.test:9000/api/v1/mailbox/#{mailbox}/failed")
      .to_return(status: 500, body: "failed")

    delete "/v1/inbucket/trash"

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.fetch("results")).to contain_exactly(
      { "mailbox" => mailbox, "id" => "deleted", "deleted" => true, "error" => nil },
      { "mailbox" => mailbox, "id" => "failed", "deleted" => false, "error" => "inbucket_error" }
    )
    expect(InbucketMessage.find_by(id: deleted.id)).to be_nil
    expect(TrashedMessage.joins(:inbucket_message).pluck("inbucket_messages.message_id")).to eq(["failed"])
  end

  private

  def authenticate
    user = User.create!(username: "admin", password: "correct horse battery staple")
    post "/v1/session",
         params: { username: user.username, password: "correct horse battery staple" }.to_json,
         headers: json_headers
    expect(response).to have_http_status(:ok)
    user
  end

  def json_headers
    { "CONTENT_TYPE" => "application/json" }
  end

  def index_message(value, source: :scan)
    normalized = value.deep_stringify_keys
    Mailbox.record(normalized.fetch("mailbox"))
    InbucketMessage.record(normalized, source:)
  end
end
