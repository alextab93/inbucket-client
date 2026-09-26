require "json"
require "uri"

class NotificationEventPayload
  def initialize(delivery, client_url: ENV["CLIENT_PUBLIC_URL"])
    @delivery = delivery
    @client_url = client_url.to_s.delete_suffix("/")
  end

  def title
    "Inbucket notification"
  end

  def text
    lines = [
      "An Inbucket message rule matched a stored message.",
      "",
      "Rule: #{rule_name}",
      "Mailbox: #{@delivery.mailbox}",
      "Message: #{@delivery.message_id}"
    ]
    lines << "" << "Open: #{message_url}" if message_url
    lines.join("\n")
  end

  def json
    {
      event: "inbucket.notification",
      rule: rule_name,
      mailbox: @delivery.mailbox,
      message_id: @delivery.message_id,
      message_url:
    }.compact
  end

  def message_url
    return if @client_url.blank?

    query = URI.encode_www_form(mailbox: @delivery.mailbox, message: @delivery.message_id)
    "#{@client_url}/?#{query}"
  end

  private

  def rule_name
    @delivery.message_rule&.name || "Deleted rule"
  end
end
