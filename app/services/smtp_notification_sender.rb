require "mail"

class SmtpNotificationSender
  def initialize(delivery, configuration: NotificationSmtpConfiguration.from_env, client_url: ENV["CLIENT_PUBLIC_URL"], recipients: nil, payload: nil)
    @delivery = delivery
    @configuration = configuration
    @client_url = client_url.to_s.delete_suffix("/")
    @recipients = recipients || @delivery.recipient
    @payload = payload || NotificationEventPayload.new(delivery, client_url: @client_url)
  end

  def deliver!
    raise ArgumentError, "SMTP is not configured" unless @configuration.valid?

    message = Mail.new
    message.from = @configuration.from
    message.to = @recipients
    message.subject = @payload.title
    message.body = @payload.text
    message.delivery_method(:smtp, @configuration.smtp_settings)
    message.deliver!
  end
end
