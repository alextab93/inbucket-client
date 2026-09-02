require "rails_helper"

RSpec.describe InbucketMailboxSync do
  let(:mailbox) { "candidate" }
  let(:message_id) { "message-1" }
  let(:header) do
    {
      mailbox:,
      id: message_id,
      from: "sender@example.com",
      to: ["candidate@example.com"],
      subject: "Original",
      date: "2026-08-28T12:00:00Z",
      size: 512,
      seen: false,
      body: "must not be stored",
      unexpected: "must not be stored"
    }
  end

  it "persists a bounded shared summary from a complete mailbox snapshot" do
    stub_mailbox([header])

    result = described_class.new.call(mailbox)
    message = InbucketMessage.find_by!(mailbox:, message_id:)

    expect(result.indexed).to eq(1)
    expect(message.metadata).to eq(header.stringify_keys.slice(*InbucketMessage::SUMMARY_FIELDS))
    expect(message.subject).to eq("Original")
    expect(message.sender).to eq("sender@example.com")
    expect(message.recipients).to eq(["candidate@example.com"])
    expect(message.size).to eq(512)
    expect(message.seen).to be(false)
    expect(Mailbox.find_by!(name: mailbox).synced_at).to be_present
  end

  it "updates an existing message without creating a duplicate" do
    stub_mailbox([header])
    described_class.new.call(mailbox)
    stub_mailbox([header.merge(subject: "Updated", seen: true)])

    described_class.new.call(mailbox)

    expect(InbucketMessage.where(mailbox:, message_id:).count).to eq(1)
    expect(InbucketMessage.find_by!(mailbox:, message_id:).rendered_summary).to include(
      "subject" => "Updated",
      "seen" => true
    )
  end

  it "removes all users' stars after a successful snapshot no longer contains a message" do
    message = indexed_message
    first_user = User.create!(username: "first", password: "password-123")
    second_user = User.create!(username: "second", password: "password-123")
    StarredMessage.create!(user: first_user, inbucket_message: message)
    StarredMessage.create!(user: second_user, inbucket_message: message)
    stub_mailbox([])

    described_class.new.call(mailbox)

    expect(message.reload.available?).to be(false)
    expect(message.starred_messages).to be_empty
  end

  it "removes message tag assignments but preserves reusable tags after a message disappears" do
    message = indexed_message
    user = User.create!(username: "admin", password: "password-123")
    tag = user.tags.create!(name: "Revelo", color: "#1D4ED8")
    tag.message_tags.create!(inbucket_message: message)
    stub_mailbox([])

    described_class.new.call(mailbox)

    expect(message.reload.available?).to be(false)
    expect(tag.reload).to be_persisted
    expect(tag.message_tags).to be_empty
  end

  it "preserves indexed messages and stars when an upstream scan fails" do
    message = indexed_message
    user = User.create!(username: "admin", password: "password-123")
    star = StarredMessage.create!(user:, inbucket_message: message)
    stub_request(:get, mailbox_url).to_return(status: 500, body: "failed")

    result = described_class.new.call(mailbox)

    expect(result.response.status).to eq(500)
    expect(message.reload.available?).to be(true)
    expect(StarredMessage.find_by(id: star.id)).to eq(star)
    expect(Mailbox.find_by!(name: mailbox).sync_error).to eq("upstream_status_500")
  end

  it "preserves indexed messages when a snapshot contains a conflicting mailbox" do
    message = indexed_message
    stub_mailbox([header.merge(mailbox: "other")])

    expect { described_class.new.call(mailbox) }.to raise_error(InbucketClient::InvalidResponse)

    expect(message.reload.available?).to be(true)
    expect(message.subject).to eq("Original")
    expect(Mailbox.find_by!(name: mailbox).sync_error).to eq("InbucketClient::InvalidResponse")
  end

  private

  def indexed_message
    Mailbox.record(mailbox)
    InbucketMessage.record(header, source: :scan)
  end

  def stub_mailbox(body)
    stub_request(:get, mailbox_url)
      .to_return(status: 200, body: body.to_json, headers: { "Content-Type" => "application/json" })
  end

  def mailbox_url
    "http://inbucket.test:9000/api/v1/mailbox/#{mailbox}"
  end
end
