class InbucketMailboxSync
  Result = Data.define(:response, :indexed, :removed)

  def initialize(client: InbucketClient.new)
    @client = client
  end

  def call(name)
    InbucketMessage.with_mailbox_lock(name) do
      mailbox = Mailbox.find_by(name:)
      start_sync(mailbox)
      response = @client.mailbox(name)
      return failure_result(mailbox, response) unless response.status.between?(200, 299)

      successful_result(name, mailbox, response)
    end
  rescue InbucketClient::Unavailable, InbucketClient::InvalidResponse => e
    record_error(name, e.class.name)
    raise
  end

  private

  def start_sync(mailbox)
    mailbox&.update!(sync_started_at: Time.current, sync_error: nil)
  end

  def successful_result(name, mailbox, response)
    raise InbucketClient::InvalidResponse unless response.body.is_a?(Array)

    mailbox ||= Mailbox.record(name) if response.body.any?
    return Result.new(response:, indexed: 0, removed: 0) unless mailbox

    outcome = InbucketMessage.reconcile_snapshot(name, response.body)
    mailbox.update!(synced_at: Time.current, sync_error: nil)
    Result.new(response:, **outcome)
  end

  def failure_result(mailbox, response)
    mailbox&.update!(sync_error: "upstream_status_#{response.status}")
    Result.new(response:, indexed: 0, removed: 0)
  end

  def record_error(name, error)
    Mailbox.find_by(name:)&.update!(sync_error: error)
  end
end
