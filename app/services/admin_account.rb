class AdminAccount
  ALL_MESSAGE_RULE_ATTRIBUTES = {
    name: "ALL",
    enabled: false,
    priority: 100,
    cooldown_seconds: 0,
    schema_version: MessageRule::SCHEMA_VERSION,
    conditions: {
      mailboxes: [],
      senders: [],
      recipients: [],
      tag_ids: [],
      time_windows: []
    },
    actions: {
      in_app: true,
      browser: false,
      destination_ids: [],
      star: false,
      mark_read: false,
      tag_ids: [],
      move_to_trash: false
    }
  }.freeze

  def self.sync!(username:, password:)
    user = User.find_or_initialize_by(username:)
    new_user = !user.persisted?
    password_changed = !user.persisted? || !user.authenticate(password)
    user.password = password
    user.password_confirmation = password
    user.save!
    user.message_rules.create!(all_message_rule_attributes) if new_user
    revoke_active_sessions(user) if password_changed
    user
  end

  def self.all_message_rule_attributes
    ALL_MESSAGE_RULE_ATTRIBUTES.deep_dup
  end

  def self.revoke_active_sessions(user)
    user.user_sessions.where(revoked_at: nil).find_each do |session|
      session.update!(revoked_at: Time.current)
    end
  end
end
