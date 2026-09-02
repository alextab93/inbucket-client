require "rails_helper"

RSpec.describe AdminAccount do
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
