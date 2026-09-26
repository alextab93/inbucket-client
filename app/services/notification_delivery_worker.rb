require "fileutils"

class NotificationDeliveryWorker
  READY_PATH = "/tmp/notification-delivery-ready".freeze

  def self.run
    FileUtils.rm_f(READY_PATH)
    File.write(READY_PATH, "ready")
    loop do
      delivery = NotificationDelivery.claim_due
      if delivery
        new(delivery).deliver
      else
        sleep 1
      end
    end
  ensure
    FileUtils.rm_f(READY_PATH)
  end

  def initialize(delivery, configuration: NotificationSmtpConfiguration.from_env)
    @delivery = delivery
    @configuration = configuration
  end

  def deliver
    return @delivery.mark_disabled! unless @delivery.message_rule&.enabled?
    return deliver_email if @delivery.kind == "email"

    destination = @delivery.notification_destination
    delivery_method = destination&.delivery_method(@delivery.kind)
    return @delivery.mark_disabled! unless delivery_method

    sender_for(delivery_method).deliver!
    @delivery.mark_delivered!
  rescue StandardError
    @delivery.retry_or_fail!("delivery_failed")
  end

  private

  def deliver_email
    return @delivery.mark_disabled! if @configuration.disabled?
    return @delivery.mark_failed!("invalid_smtp_configuration") unless @configuration.valid?

    delivery_method = @delivery.notification_destination&.delivery_method("email")
    recipients = delivery_method&.fetch("recipients", [])
    recipients ||= [@delivery.recipient] if NotificationDestinationSchema::EMAIL_PATTERN.match?(@delivery.recipient.to_s)
    return @delivery.mark_disabled! if recipients.blank?

    SmtpNotificationSender.new(@delivery, configuration: @configuration, recipients:).deliver!
    @delivery.mark_delivered!
  end

  def sender_for(delivery_method)
    case @delivery.kind
    when "ntfy"
      NtfyNotificationSender.new(@delivery, delivery_method:)
    when "webhook"
      WebhookNotificationSender.new(@delivery, delivery_method:)
    end
  end
end
