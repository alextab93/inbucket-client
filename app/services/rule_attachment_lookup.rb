require "mail"

class RuleAttachmentLookup
  MAXIMUM_SOURCE_BYTES = 5.megabytes

  def initialize(client: InbucketClient.new)
    @client = client
  end

  def call(message)
    return if message.size.to_i > MAXIMUM_SOURCE_BYTES

    response = @client.source(message.mailbox, message.message_id)
    return unless response.status.between?(200, 299)

    Mail.read_from_string(response.body).all_parts.any?(&:attachment?)
  rescue InbucketClient::Unavailable, InbucketClient::InvalidResponse, Mail::Field::ParseError, ArgumentError
    nil
  end
end
