require "json"
require "net/http"
require "uri"

class WebhookNotificationSender
  def initialize(delivery, delivery_method:, payload: nil)
    @delivery = delivery
    @delivery_method = delivery_method
    @payload = payload || NotificationEventPayload.new(delivery)
  end

  def deliver!
    response = perform_request
    raise "webhook delivery failed" unless response.is_a?(Net::HTTPSuccess)
  end

  private

  def perform_request
    uri = URI.parse(@delivery_method.fetch("url"))
    request = Net::HTTPGenericRequest.new(@delivery_method.fetch("method"), true, true, uri.request_uri)
    @delivery_method.fetch("headers").each { |header| request[header.fetch("name")] = header.fetch("value") }
    request["Content-Type"] ||= "application/json"
    request.body = @delivery_method.fetch("body").presence || JSON.generate(@payload.json)
    Net::HTTP.start(
      uri.host,
      uri.port,
      use_ssl: uri.scheme == "https",
      open_timeout: 5,
      read_timeout: 5,
      write_timeout: 5
    ) { |connection| connection.request(request) }
  end
end
