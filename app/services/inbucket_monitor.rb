require "eventmachine"
require "faye/websocket"
require "fileutils"
require "json"
require "uri"

class InbucketMonitor
  RECONNECT_DELAY = 5
  READY_PATH = "/tmp/inbucket-monitor-ready".freeze

  class << self
    def run
      FileUtils.rm_f(READY_PATH)
      EventMachine.run { connect }
    end

    def record(payload)
      event = JSON.parse(payload)
      record_stored(event["header"]) if event["variant"] == "message-stored"
      record_deleted(event["identifier"]) if event["variant"] == "message-deleted"
    rescue JSON::ParserError
      nil
    end

    private

    def record_stored(header)
      return unless header.is_a?(Hash)

      mailbox = Mailbox.record(header["mailbox"])
      return unless mailbox

      InbucketMessage.with_mailbox_lock(mailbox.name) do
        InbucketMessage.record(header, source: :monitor)
      end
    end

    def record_deleted(identifier)
      return unless identifier.is_a?(Hash)

      mailbox = identifier["mailbox"].to_s
      message_id = identifier["id"].to_s
      return if mailbox.empty? || message_id.empty? || !Mailbox.exists?(name: mailbox)

      InbucketMessage.with_mailbox_lock(mailbox) do
        InbucketMessage.mark_unavailable(mailbox, message_id)
      end
    end

    def connect
      socket = Faye::WebSocket::Client.new(monitor_url)
      socket.on(:open) { File.write(READY_PATH, "connected") }
      socket.on(:message) { |event| record(event.data) }
      socket.on(:close) do
        FileUtils.rm_f(READY_PATH)
        EventMachine.add_timer(RECONNECT_DELAY) { connect }
      end
    end

    def monitor_url
      base_url = URI(ENV.fetch("INBUCKET_BASE_URL"))
      base_url.scheme = base_url.scheme == "https" ? "wss" : "ws"
      base_url.path = "#{base_url.path.delete_suffix("/")}/api/v2/monitor/messages"
      base_url.query = nil
      base_url.to_s
    end
  end
end
