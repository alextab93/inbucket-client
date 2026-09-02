class MessageTagAssignment
  Result = Data.define(:response, :message, :tags)

  def initialize(user:, client:, identity:, tag:, assigned:)
    @user = user
    @client = client
    @mailbox = identity.fetch(:mailbox)
    @message_id = identity.fetch(:message_id)
    @tag = tag
    @assigned = assigned
  end

  def call
    response, message = InbucketMessage.with_mailbox_lock(mailbox) do
      assign_after_fetch
    end
    tags = message ? assigned_tags(message) : []
    Result.new(response:, message:, tags:)
  end

  private

  attr_reader :user, :client, :mailbox, :message_id, :tag, :assigned

  def assign_after_fetch
    response = client.message(mailbox, message_id)
    return [response] unless response.status.between?(200, 299)
    raise InbucketClient::InvalidResponse unless response.body.is_a?(Hash)

    message = indexed_message(response.body)
    assignment = tag.message_tags.find_by(inbucket_message: message)
    assigned ? (assignment || tag.message_tags.create!(inbucket_message: message)) : assignment&.destroy!
    [response, message]
  end

  def indexed_message(body)
    Mailbox.record(mailbox)
    existing = InbucketMessage.find_by(mailbox:, message_id:)
    if existing&.available?
      existing.update!(direct_observed_at: Time.current)
      return existing
    end

    InbucketMessage.record(body.merge("mailbox" => mailbox, "id" => message_id), source: :direct)
  end

  def assigned_tags(message)
    user.tags.joins(:message_tags)
        .where(message_tags: { inbucket_message: message })
        .ordered
        .map(&:rendered)
  end
end
