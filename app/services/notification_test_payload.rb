class NotificationTestPayload
  def initialize(destination:, kind:)
    @destination = destination
    @kind = kind
  end

  def title
    "Inbucket test notification"
  end

  def text
    [
      "This is a test from Inbucket for #{@destination.name}.",
      "",
      "Delivery method: #{@kind}",
      "If you received this message, the delivery method is working."
    ].join("\n")
  end

  def json
    {
      event: "inbucket.notification.test",
      destination: @destination.name,
      method: @kind,
      test: true
    }
  end

  def message_url
    nil
  end
end
