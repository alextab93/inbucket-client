require "rails_helper"

RSpec.describe "Message tags", type: :request do
  let(:mailbox) { "candidate" }
  let(:message_id) { "message-1" }
  let(:message) do
    {
      mailbox:,
      id: message_id,
      from: "sender@example.com",
      subject: "Tagged message",
      date: "2026-08-29T12:00:00Z",
      size: 512,
      body: { text: "This must stay upstream" }
    }
  end

  it "requires authentication for tag data" do
    get "/v1/tags"

    expect(response).to have_http_status(:unauthorized)
    expect(response.parsed_body).to eq("error" => "unauthorized")
  end

  it "creates, normalizes, updates, lists, and deletes reusable tags" do
    authenticate

    post "/v1/tags", params: { name: "  Needs   Review  ", color: "#1D4ED8" }.to_json, headers: json_headers

    expect(response).to have_http_status(:created)
    created = response.parsed_body
    expect(created).to include("name" => "Needs Review", "color" => "#1D4ED8")

    patch "/v1/tags/#{created.fetch("id")}",
          params: { name: "Revelo" }.to_json,
          headers: json_headers

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).to include("name" => "Revelo", "color" => "#1D4ED8")

    patch "/v1/tags/#{created.fetch("id")}",
          params: { color: "#15803D" }.to_json,
          headers: json_headers

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).to include("name" => "Revelo", "color" => "#15803D")

    get "/v1/tags"

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).to contain_exactly(include("name" => "Revelo", "color" => "#15803D"))

    delete "/v1/tags/#{created.fetch("id")}", headers: json_headers

    expect(response).to have_http_status(:no_content)
    expect(Tag.find_by(id: created.fetch("id"))).to be_nil
  end

  it "rejects duplicate names and noncanonical colors" do
    user = authenticate
    user.tags.create!(name: "Revelo", color: "#1D4ED8")

    post "/v1/tags", params: { name: "revelo", color: "#4338CA" }.to_json, headers: json_headers

    expect(response).to have_http_status(:conflict)
    expect(response.parsed_body).to include("error" => "invalid_tag")

    post "/v1/tags", params: { name: "Lowercase", color: "#abcdef" }.to_json, headers: json_headers

    expect(response).to have_http_status(:unprocessable_content)
    expect(response.parsed_body).to include("error" => "invalid_tag")
    expect(user.tags.pluck(:name)).to eq(["Revelo"])
  end

  it "rejects blank and overlength names without persisting a tag" do
    user = authenticate

    post "/v1/tags", params: { name: "   ", color: "#1D4ED8" }.to_json, headers: json_headers

    expect(response).to have_http_status(:unprocessable_content)
    expect(response.parsed_body).to eq("error" => "invalid_request")

    post "/v1/tags", params: { name: "x" * 41, color: "#1D4ED8" }.to_json, headers: json_headers

    expect(response).to have_http_status(:unprocessable_content)
    expect(response.parsed_body).to include("error" => "invalid_tag")
    expect(response.parsed_body.dig("fields", "name")).to be_present

    expect(user.tags).to be_empty
  end

  it "accepts every named preset color" do
    user = authenticate
    preset_colors = {
      "Blue" => "#1D4ED8",
      "Indigo" => "#4338CA",
      "Violet" => "#6D28D9",
      "Magenta" => "#A21CAF",
      "Rose" => "#BE123C",
      "Red" => "#B91C1C",
      "Orange" => "#C2410C",
      "Amber" => "#A16207",
      "Green" => "#15803D",
      "Teal" => "#0F766E"
    }

    preset_colors.each do |name, color|
      post "/v1/tags", params: { name:, color: }.to_json, headers: json_headers
      expect(response).to have_http_status(:created)
      expect(response.parsed_body).to include("name" => name, "color" => color)
    end

    expect(user.tags.ordered.pluck(:name)).to match_array(preset_colors.keys)
  end

  it "accepts and persists a canonical custom color" do
    user = authenticate

    post "/v1/tags", params: { name: "Custom", color: "#ABCDEF" }.to_json, headers: json_headers

    expect(response).to have_http_status(:created)
    created = response.parsed_body
    expect(created).to include("name" => "Custom", "color" => "#ABCDEF")
    expect(user.tags.find(created.fetch("id")).color).to eq("#ABCDEF")
  end

  it "lists and mutates only the signed-in user's tag definitions" do
    user = authenticate
    owned = user.tags.create!(name: "Owned", color: "#0F766E")
    other = User.create!(username: "other", password: "password-123")
    private_tag = other.tags.create!(name: "Private", color: "#BE123C")

    get "/v1/tags"

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).to eq([owned.rendered.stringify_keys])

    patch "/v1/tags/#{private_tag.id}",
          params: { name: "Exposed", color: "#B91C1C" }.to_json,
          headers: json_headers

    expect(response).to have_http_status(:not_found)
    expect(private_tag.reload.attributes).to include("name" => "Private", "color" => "#BE123C")

    delete "/v1/tags/#{private_tag.id}", headers: json_headers

    expect(response).to have_http_status(:not_found)
    expect(private_tag.reload).to be_persisted
  end

  it "assigns and removes owned tags idempotently after confirming the message exists" do
    user = authenticate
    tag = user.tags.create!(name: "Revelo", color: "#6D28D9")
    stub_json("/api/v1/mailbox/#{mailbox}/#{message_id}", message)

    2.times do
      patch "/v1/inbucket/mailboxes/#{mailbox}/messages/#{message_id}/tags/#{tag.id}",
            params: { assigned: true }.to_json,
            headers: json_headers
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to include(
        "assigned" => true,
        "tags" => [include("id" => tag.id, "name" => "Revelo", "color" => "#6D28D9")]
      )
    end
    expect(tag.message_tags.count).to eq(1)

    patch "/v1/inbucket/mailboxes/#{mailbox}/messages/#{message_id}/tags/#{tag.id}",
          params: { assigned: false }.to_json,
          headers: json_headers

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).to eq("assigned" => false, "tags" => [])
    expect(tag.reload.message_tags).to be_empty
    expect(tag).to be_persisted
  end

  it "does not assign another user's tag or a message missing upstream" do
    user = authenticate
    other = User.create!(username: "other", password: "password-123")
    other_tag = other.tags.create!(name: "Private", color: "#BE123C")

    patch "/v1/inbucket/mailboxes/#{mailbox}/messages/#{message_id}/tags/#{other_tag.id}",
          params: { assigned: true }.to_json,
          headers: json_headers

    expect(response).to have_http_status(:not_found)

    owned = user.tags.create!(name: "Owned", color: "#0F766E")
    stub_request(:get, "http://inbucket.test:9000/api/v1/mailbox/#{mailbox}/missing")
      .to_return(status: 404, body: "not found")

    patch "/v1/inbucket/mailboxes/#{mailbox}/messages/missing/tags/#{owned.id}",
          params: { assigned: true }.to_json,
          headers: json_headers

    expect(response).to have_http_status(:not_found)
    expect(MessageTag.count).to eq(0)
  end

  it "filters before pagination totals and exposes only the signed-in user's assignments" do
    user = authenticate
    other = User.create!(username: "other", password: "password-123")
    revelo = user.tags.create!(name: "Revelo", color: "#A21CAF")
    private_tag = other.tags.create!(name: "Private", color: "#B91C1C")
    matching = [
      index_message(message.merge(id: "matching-3", subject: "No tag word here", date: "2026-08-29T15:00:00Z")),
      index_message(message.merge(id: "matching-2", subject: "Another match", date: "2026-08-29T14:00:00Z")),
      index_message(message.merge(id: "matching-1", subject: "Oldest match", date: "2026-08-29T13:00:00Z"))
    ]
    another = index_message(message.merge(id: "another", subject: "Revelo only in subject"))
    matching.each { |value| revelo.message_tags.create!(inbucket_message: value) }
    private_tag.message_tags.create!(inbucket_message: matching.first)

    get "/v1/inbucket/messages", params: { mailboxes: [mailbox], tag: revelo.id, limit: 2 }

    expect(response).to have_http_status(:ok)
    page = response.parsed_body
    expect(page.fetch("total_count")).to eq(3)
    expect(page.fetch("next_cursor")).to be_present
    get "/v1/inbucket/messages",
        params: { mailboxes: [mailbox], tag: revelo.id, limit: 2, cursor: page.fetch("next_cursor") }
    all_messages = page.fetch("messages") + response.parsed_body.fetch("messages")
    expect(response.parsed_body.fetch("total_count")).to eq(3)
    expect(response.parsed_body.fetch("next_cursor")).to be_nil
    expect(all_messages.map { |value| value.fetch("id") }).to eq(%w[matching-3 matching-2 matching-1])
    expect(all_messages.flat_map { |value| value.fetch("tags") }.map { |tag| tag.fetch("name") }.uniq).to eq(["Revelo"])
    expect(page.to_json).not_to include("Private")
    expect(page.fetch("messages").map { |value| value.fetch("id") }).not_to include(another.message_id)
  end

  it "removes assignments while preserving tags when a message becomes unavailable" do
    user = authenticate
    tag = user.tags.create!(name: "Reusable", color: "#A16207")
    indexed = index_message(message)
    tag.message_tags.create!(inbucket_message: indexed)

    indexed.mark_unavailable!

    expect(tag.reload).to be_persisted
    expect(tag.message_tags).to be_empty
    expect(indexed.reload.available?).to be(false)
  end

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

  def index_message(header)
    Mailbox.record(header.fetch(:mailbox))
    InbucketMessage.record(header, source: :scan)
  end

  def stub_json(path, body)
    stub_request(:get, "http://inbucket.test:9000#{path}")
      .to_return(status: 200, body: body.to_json, headers: { "Content-Type" => "application/json" })
  end
end
