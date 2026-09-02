require "cgi"
require "json"
require "net/http"

class InbucketClient
  class Unavailable < StandardError; end
  class InvalidResponse < StandardError; end

  Response = Data.define(:status, :body, :content_type)

  def initialize(base_url: ENV.fetch("INBUCKET_BASE_URL"))
    @base_url = URI(base_url)
  end

  def mailbox(name)
    get_json("/api/v1/mailbox/#{escape(name)}")
  end

  def message(name, id)
    get_json("/api/v1/mailbox/#{escape(name)}/#{escape(id)}")
  end

  def source(name, id)
    get("/api/v1/mailbox/#{escape(name)}/#{escape(id)}/source")
  end

  def mark_seen(name, id)
    patch_json("/api/v1/mailbox/#{escape(name)}/#{escape(id)}", seen: true)
  end

  def purge_mailbox(name)
    delete("/api/v1/mailbox/#{escape(name)}")
  end

  def delete_message(name, id)
    delete("/api/v1/mailbox/#{escape(name)}/#{escape(id)}")
  end

  private

  def get_json(path)
    response = get(path)
    return response unless response.status.between?(200, 299)

    Response.new(status: response.status, body: JSON.parse(response.body), content_type: "application/json")
  rescue JSON::ParserError
    raise InvalidResponse
  end

  def get(path)
    request(path, Net::HTTP::Get)
  end

  def patch_json(path, body)
    request(path, Net::HTTP::Patch, body: JSON.generate(body), content_type: "application/json")
  end

  def delete(path)
    request(path, Net::HTTP::Delete)
  end

  def request(path, request_class, body: nil, content_type: nil)
    uri = @base_url.dup
    uri.path = [@base_url.path.delete_suffix("/"), path].join
    request = request_class.new(uri)
    request["Accept"] = "application/json"
    request["Content-Type"] = content_type if content_type
    request.body = body if body
    options = { use_ssl: uri.scheme == "https", open_timeout: 5, read_timeout: 10 }
    response = Net::HTTP.start(uri.host, uri.port, **options) do |http|
      http.request(request)
    end
    Response.new(status: response.code.to_i, body: response.body, content_type: response["Content-Type"])
  rescue IOError, SocketError, SystemCallError, Timeout::Error
    raise Unavailable
  end

  def escape(value)
    CGI.escapeURIComponent(value.to_s)
  end
end
