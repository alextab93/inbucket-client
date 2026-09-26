require "uri"

class NotificationDestinationSchema
  class Invalid < StandardError
  end

  EMAIL_PATTERN = MessageRuleSchema::EMAIL_PATTERN
  KINDS = %w[email ntfy webhook].freeze
  WEBHOOK_METHODS = %w[POST PUT PATCH DELETE].freeze
  HEADER_NAME_PATTERN = /\A[A-Za-z0-9!#$%&'*+.^_`|~-]+\z/
  RESERVED_HEADERS = %w[content-length host transfer-encoding].freeze

  class << self
    def methods(value)
      input = array(value, "delivery methods", 3)
      result = input.map { |method| normalize_method(method) }
      raise Invalid, "choose at least one delivery method" if result.empty?
      raise Invalid, "each delivery method can be configured once" if result.map { |method| method.fetch("kind") }.uniq.length != result.length

      result.sort_by { |method| method.fetch("kind") }
    end

    private

    def normalize_method(value)
      input = object(value, "delivery method")
      kind = input["kind"]
      raise Invalid, "delivery method kind is invalid" unless KINDS.include?(kind)

      case kind
      when "email"
        reject_unknown!(input, %w[kind recipients], "email delivery method")
        recipients = strings(input["recipients"], "email recipients", 5)
        raise Invalid, "email recipients must be valid addresses" unless recipients.all? { |recipient| EMAIL_PATTERN.match?(recipient) }

        { "kind" => kind, "recipients" => recipients }
      when "ntfy"
        reject_unknown!(input, %w[kind host topic token], "ntfy delivery method")
        {
          "kind" => kind,
          "host" => host(input["host"], "ntfy host"),
          "topic" => topic(input["topic"]),
          "token" => token(input["token"])
        }.compact
      when "webhook"
        reject_unknown!(input, %w[kind url method headers body], "webhook delivery method")
        { "kind" => kind, "url" => url(input["url"]), "method" => webhook_method(input["method"]), "headers" => headers(input["headers"]), "body" => body(input["body"]) }
      end
    end

    def object(value, name)
      return value.to_unsafe_h.deep_stringify_keys if value.respond_to?(:to_unsafe_h)
      return value.deep_stringify_keys if value.is_a?(Hash)

      raise Invalid, "#{name} must be an object"
    end

    def array(value, name, maximum)
      return [] if value.nil?
      raise Invalid, "#{name} must be a list" unless value.is_a?(Array)
      raise Invalid, "#{name} has too many values" if value.length > maximum

      value
    end

    def reject_unknown!(input, allowed, name)
      raise Invalid, "#{name} contains unsupported fields" if (input.keys - allowed).any?
    end

    def strings(value, name, maximum)
      values = array(value, name, maximum).map do |entry|
        raise Invalid, "#{name} values must be text" unless entry.is_a?(String)

        normalized = entry.squish.downcase
        raise Invalid, "#{name} values must not be empty" if normalized.empty? || normalized.length > 254

        normalized
      end
      values.uniq.sort
    end

    def host(value, name)
      normalized = uri(value, name)
      raise Invalid, "#{name} must not include a query or fragment" if normalized.query || normalized.fragment

      normalized.path = normalized.path.delete_suffix("/")
      normalized.to_s
    end

    def url(value)
      normalized = uri(value, "webhook URL")
      raise Invalid, "webhook URL must not include a fragment" if normalized.fragment

      normalized.to_s
    end

    def uri(value, name)
      raise Invalid, "#{name} must be text" unless value.is_a?(String)
      raise Invalid, "#{name} is too long" if value.length > 2048

      normalized = URI.parse(value.strip)
      unless normalized.is_a?(URI::HTTP) && normalized.host.present? && normalized.userinfo.blank?
        raise Invalid, "#{name} must be an HTTP or HTTPS URL without credentials"
      end

      normalized
    rescue URI::InvalidURIError
      raise Invalid, "#{name} must be a valid URL"
    end

    def topic(value)
      raise Invalid, "ntfy topic must be text" unless value.is_a?(String)

      normalized = value.strip
      raise Invalid, "ntfy topic must contain only letters, numbers, hyphens, or underscores" unless /\A[-_A-Za-z0-9]{1,64}\z/.match?(normalized)

      normalized
    end

    def token(value)
      return if value.nil?
      raise Invalid, "ntfy access token must be text" unless value.is_a?(String)

      normalized = value.strip
      return if normalized.empty?
      raise Invalid, "ntfy access token is too long" if normalized.length > 1024
      raise Invalid, "ntfy access token is invalid" if normalized.match?(/[\r\n]/)

      normalized
    end

    def webhook_method(value)
      normalized = value.to_s.upcase
      raise Invalid, "webhook method is invalid" unless WEBHOOK_METHODS.include?(normalized)

      normalized
    end

    def headers(value)
      array(value, "webhook headers", 20).map do |entry|
        input = object(entry, "webhook header")
        reject_unknown!(input, %w[name value], "webhook header")
        name = input["name"].to_s.strip
        body = input["value"]
        raise Invalid, "webhook header name is invalid" unless HEADER_NAME_PATTERN.match?(name)
        raise Invalid, "webhook header #{name} is reserved" if RESERVED_HEADERS.include?(name.downcase)
        raise Invalid, "webhook header value must be text" unless body.is_a?(String) && body.length <= 2048 && !body.match?(/[\r\n]/)

        { "name" => name, "value" => body }
      end.then do |result|
        raise Invalid, "webhook header names must be unique" unless result.map { |header| header.fetch("name").downcase }.uniq.length == result.length

        result.sort_by { |header| header.fetch("name").downcase }
      end
    end

    def body(value)
      return "" if value.nil?
      raise Invalid, "webhook body must be text" unless value.is_a?(String) && value.length <= 10_000

      value
    end
  end
end
