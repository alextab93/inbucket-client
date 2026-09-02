require "rails_helper"

RSpec.describe MessageTagAssignment do
  self.use_transactional_tests = false

  before do
    MessageTag.delete_all
    Tag.delete_all
    StarredMessage.delete_all
    InbucketMessage.delete_all
    Mailbox.delete_all
    UserSession.delete_all
    User.delete_all
  end

  after do
    MessageTag.delete_all
    Tag.delete_all
    StarredMessage.delete_all
    InbucketMessage.delete_all
    Mailbox.delete_all
    UserSession.delete_all
    User.delete_all
  end

  it "leaves no assignment when deletion overlaps assignment for the same mailbox" do
    user, tag, message = records
    run_overlap(user, tag, message)

    expect(message.reload.available?).to be(false)
    expect(tag.reload.message_tags).to be_empty
    expect(tag).to be_persisted
  end

  private

  def run_overlap(user, tag, message)
    entered = Queue.new
    release = Queue.new
    stub_delayed_message(entered, release)

    assignment = Thread.new { run_assignment(user, tag) }
    entered.pop
    deletion = Thread.new { mark_unavailable(message) }
    release << true
    assignment.value
    deletion.value
  end

  def records
    user = User.create!(username: "admin", password: "password-123")
    tag = user.tags.create!(name: "Revelo", color: "#1D4ED8")
    Mailbox.record("candidate")
    message = InbucketMessage.record({ mailbox: "candidate", id: "message-1" }, source: :scan)
    [user, tag, message]
  end

  def stub_delayed_message(entered, release)
    stub_request(:get, "http://inbucket.test:9000/api/v1/mailbox/candidate/message-1")
      .to_return do
        entered << true
        release.pop
        {
          status: 200,
          body: { mailbox: "candidate", id: "message-1" }.to_json,
          headers: { "Content-Type" => "application/json" }
        }
      end
  end

  def run_assignment(user, tag)
    ActiveRecord::Base.connection_pool.with_connection do
      described_class.new(
        user:,
        client: InbucketClient.new,
        identity: { mailbox: "candidate", message_id: "message-1" },
        tag:,
        assigned: true
      ).call
    end
  end

  def mark_unavailable(message)
    ActiveRecord::Base.connection_pool.with_connection do
      InbucketMessage.with_mailbox_lock("candidate") { message.reload.mark_unavailable! }
    end
  end
end
