class MessageRule < ApplicationRecord
  SCHEMA_VERSION = 4

  belongs_to :user
  has_many :notification_deliveries, dependent: :nullify

  normalizes :name, with: ->(name) { name.to_s.squish }

  validates :name, presence: true, length: { maximum: 80 }, uniqueness: { scope: :user_id, case_sensitive: false }
  validates :priority, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: 100 }
  validates :cooldown_seconds, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: 86_400 }
  validates :schema_version, inclusion: { in: [SCHEMA_VERSION] }
  validate :payload_is_valid
  validate :enabled_rule_has_an_action
  validate :destinations_belong_to_user
  validate :action_tags_belong_to_user

  before_validation :normalize_payload
  after_commit :write_lua_script, on: %i[create update]
  after_update_commit :disable_pending_deliveries, if: :saved_change_to_enabled?
  before_destroy :disable_pending_deliveries
  after_destroy_commit :write_lua_script

  scope :ordered, -> { order(priority: :desc, name: :asc, id: :asc) }

  def destination_ids
    Array(actions["destination_ids"])
  end

  def action_tag_ids
    Array(actions["tag_ids"])
  end

  def actions_configured?(value = actions)
    value["in_app"] || value["browser"] || Array(value["destination_ids"]).any? || value["star"] || value["mark_read"] || Array(value["tag_ids"]).any? || value["move_to_trash"]
  end

  def rendered
    {
      id:,
      name:,
      enabled:,
      priority:,
      cooldown_seconds:,
      schema_version:,
      conditions:,
      actions:,
      last_error_code:,
      last_failed_at: last_failed_at&.iso8601(6),
      summary: human_summary
    }
  end

  def human_summary
    conditions_summary = []
    conditions_summary << "mailbox" if conditions.fetch("mailboxes", []).any?
    conditions_summary << "sender" if conditions.fetch("senders", []).any?
    conditions_summary << "recipient" if conditions.fetch("recipients", []).any?
    conditions_summary << "subject" if conditions["subject"].present?
    conditions_summary << "size" if conditions["minimum_size"] || conditions["maximum_size"]
    conditions_summary << "attachments" if conditions.key?("has_attachments")
    conditions_summary << "tags" if conditions.fetch("tag_ids", []).any?
    conditions_summary << "time" if conditions.fetch("time_windows", []).any?
    action_summary = []
    action_summary << "send a notification" if actions["in_app"] || actions["browser"] || destination_ids.any?
    action_summary << "star the message" if actions["star"]
    action_summary << "mark it as read" if actions["mark_read"]
    action_summary << "apply tags" if action_tag_ids.any?
    action_summary << "move it to Trash" if actions["move_to_trash"]
    "When #{conditions_summary.presence&.join(", ") || "any message"} matches, #{action_summary.presence&.join(", ") || "take no action"}."
  end

  def record_failure!(error)
    update_columns(
      last_error_code: error.class.name.underscore,
      last_failed_at: Time.current,
      updated_at: Time.current
    )
  end

  def clear_failure!
    return unless last_error_code

    update_columns(last_error_code: nil, last_failed_at: nil, updated_at: Time.current)
  end

  private

  def write_lua_script
    RuleLuaScript.write!
  rescue RuleLuaScript::Unavailable
    nil
  end

  def disable_pending_deliveries
    return if enabled?

    notification_deliveries.where(status: %w[pending retrying sending]).update_all(
      status: "disabled",
      next_attempt_at: nil,
      locked_at: nil,
      updated_at: Time.current
    )
  end

  def normalize_payload
    @payload_error = nil
    self.schema_version = SCHEMA_VERSION
    self.conditions = MessageRuleSchema.conditions(conditions)
    self.actions = MessageRuleSchema.actions(actions)
  rescue MessageRuleSchema::Invalid => error
    @payload_error = error
  end

  def payload_is_valid
    errors.add(:base, @payload_error.message) if @payload_error
  end

  def enabled_rule_has_an_action
    return unless enabled? && !actions_configured?

    errors.add(:actions, "must include at least one action")
  end

  def destinations_belong_to_user
    return if destination_ids.empty? || user.nil?
    return if user.notification_destinations.where(id: destination_ids).count == destination_ids.length

    errors.add(:actions, "contains an unavailable destination")
  end

  def action_tags_belong_to_user
    return if action_tag_ids.empty? || user.nil?
    return if user.tags.where(id: action_tag_ids).count == action_tag_ids.length

    errors.add(:actions, "contains an unavailable tag")
  end
end
