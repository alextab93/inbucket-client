require "rails_helper"

RSpec.describe InbucketReconciler do
  it "refreshes every known mailbox and reports no failures" do
    Mailbox.record("alerts")
    Mailbox.record("support")
    stub_request(:get, "http://inbucket.test:9000/api/v1/mailbox/alerts")
      .to_return(status: 200, body: [{ mailbox: "alerts", id: "alert-1" }].to_json)
    stub_request(:get, "http://inbucket.test:9000/api/v1/mailbox/support")
      .to_return(status: 200, body: [{ mailbox: "support", id: "support-1" }].to_json)

    failures = described_class.new.run_once

    expect(failures).to eq(0)
    expect(InbucketMessage.available.pluck(:mailbox, :message_id)).to contain_exactly(
      %w[alerts alert-1],
      %w[support support-1]
    )
    expect(Mailbox.where.not(synced_at: nil).pluck(:name)).to contain_exactly("alerts", "support")
  end

  it "continues reconciling known mailboxes after one upstream failure" do
    Mailbox.record("alerts")
    Mailbox.record("support")
    stub_request(:get, "http://inbucket.test:9000/api/v1/mailbox/alerts")
      .to_return(status: 500, body: "failed")
    stub_request(:get, "http://inbucket.test:9000/api/v1/mailbox/support")
      .to_return(status: 200, body: [{ mailbox: "support", id: "support-1" }].to_json)

    failures = described_class.new.run_once

    expect(failures).to eq(1)
    expect(Mailbox.find_by!(name: "alerts").sync_error).to eq("upstream_status_500")
    expect(InbucketMessage.find_by(mailbox: "support", message_id: "support-1")&.available?).to be(true)
  end
end
