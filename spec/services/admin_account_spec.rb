require "rails_helper"

RSpec.describe AdminAccount do
  def expect_all_message_example(rule)
    expect(rule).to have_attributes(enabled: false, priority: 100, cooldown_seconds: 0)
    expect(rule.conditions).to eq(
      "mailboxes" => [],
      "senders" => [],
      "recipients" => [],
      "tag_ids" => [],
      "time_windows" => []
    )
    expect(rule.actions).to include("in_app" => true, "browser" => false)
  end

  it "creates a disabled all-messages example for a new account" do
    user = described_class.sync!(username: "admin", password: "correct horse battery staple")

    expect_all_message_example(user.message_rules.find_by!(name: "ALL"))
  end

  it "does not recreate the example rule after deletion" do
    user = described_class.sync!(username: "admin", password: "correct horse battery staple")
    user.message_rules.find_by!(name: "ALL").destroy!

    described_class.sync!(username: "admin", password: "correct horse battery staple")

    expect(user.reload.message_rules.where(name: "ALL")).to be_empty
  end

  it "replaces the password and invalidates active sessions" do
    user = User.create!(username: "admin", password: "correct horse battery staple")
    session, = UserSession.issue!(user)

    described_class.sync!(username: "admin", password: "new correct horse battery staple")

    expect(user.reload.authenticate("correct horse battery staple")).to be(false)
    expect(user.authenticate("new correct horse battery staple")).to eq(user)
    expect(session.reload.active?).to be(false)
  end

  it "preserves active sessions when the saved password is unchanged" do
    user = User.create!(username: "admin", password: "correct horse battery staple")
    session, = UserSession.issue!(user)

    described_class.sync!(username: "admin", password: "correct horse battery staple")

    expect(session.reload.active?).to be(true)
  end
end
