class NotificationDestinationTestSender
  class InvalidMethod < StandardError
  end

  class DeliveryFailed < StandardError
    attr_reader :code

    def initialize(code)
      @code = code
      super(code)
    end
  end

  def initialize(destination:, kind:, configuration: NotificationSmtpConfiguration.from_env)
    @destination = destination
    @kind = kind
    @configuration = configuration
  end

  def deliver!
    delivery_method = @destination.delivery_method(@kind)
    raise InvalidMethod unless delivery_method

    payload = NotificationTestPayload.new(destination: @destination, kind: @kind)
    case @kind
    when "email"
      deliver_email(delivery_method, payload)
    when "ntfy"
      NtfyNotificationSender.new(nil, delivery_method:, payload:).deliver!
    when "webhook"
      WebhookNotificationSender.new(nil, delivery_method:, payload:).deliver!
    end
  rescue InvalidMethod, DeliveryFailed
    raise
  rescue NtfyNotificationSender::Failed => error
    raise DeliveryFailed, error.code
  rescue StandardError
    raise DeliveryFailed, "test_delivery_failed"
  end

  private

  def deliver_email(delivery_method, payload)
    raise DeliveryFailed, "smtp_disabled" if @configuration.disabled?
    raise DeliveryFailed, "smtp_invalid" unless @configuration.valid?

    SmtpNotificationSender.new(
      nil,
      configuration: @configuration,
      recipients: delivery_method.fetch("recipients"),
      payload:
    ).deliver!
  end
end
