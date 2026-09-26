require "mail"

class NotificationSmtpConfiguration
  attr_reader :host, :port, :username, :password, :from, :security

  def self.from_env(env = ENV)
    return new(state: "disabled") unless env["OUTBOUND_SMTP_ENABLED"] == "true"

    new(
      state: "ready",
      host: env["OUTBOUND_SMTP_HOST"],
      port: env["OUTBOUND_SMTP_PORT"],
      username: env["OUTBOUND_SMTP_USERNAME"],
      password: env["OUTBOUND_SMTP_PASSWORD"],
      from: env["OUTBOUND_SMTP_FROM"],
      security: env["OUTBOUND_SMTP_SECURITY"]
    )
  end

  def initialize(state:, host: nil, port: nil, username: nil, password: nil, from: nil, security: nil)
    @state = state
    @host = host.to_s
    @port = port.to_s
    @username = username.to_s
    @password = password.to_s
    @from = from.to_s
    @security = security.to_s
  end

  def disabled?
    @state == "disabled"
  end

  def valid?
    return false if disabled? || from.match?(/[\r\n]/)

    host.present? && port.match?(/\A\d+\z/) && Integer(port).between?(1, 65_535) && valid_from? && %w[tls starttls].include?(security)
  end

  def smtp_settings
    {
      address: host,
      port: Integer(port),
      user_name: username.presence,
      password: password.presence,
      authentication: username.present? ? :plain : nil,
      enable_starttls_auto: security == "starttls",
      tls: security == "tls"
    }.compact
  end

  private

  def valid_from?
    address = Mail::Address.new(from).address
    address.present? && address.match?(MessageRuleSchema::EMAIL_PATTERN)
  rescue Mail::Field::ParseError
    false
  end
end
