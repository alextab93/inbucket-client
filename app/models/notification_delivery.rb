require "digest"

class NotificationDelivery < ApplicationRecord
  MAXIMUM_OUTBOUND_DELIVERIES_PER_MINUTE = 60
  TERMINAL_RETENTION = 30.days
  KINDS = %w[in_app browser email ntfy webhook].freeze
  OUTBOUND_KINDS = %w[email ntfy webhook].freeze
  STATUSES = %w[pending sending retrying delivered failed disabled].freeze

  belongs_to :user
  belongs_to :message_rule, optional: true
  belongs_to :notification_destination, optional: true
  belongs_to :inbucket_message, optional: true

  validates :kind, inclusion: { in: KINDS }
  validates :status, inclusion: { in: STATUSES }
  validates :mailbox, :message_id, :deduplication_key, presence: true
  validates :recipient, presence: true, if: -> { kind.in?(OUTBOUND_KINDS) }

  after_create_commit :prune_terminal_records

  scope :active, -> { where(cleared_at: nil) }
  scope :visible, -> { active.order(created_at: :desc, id: :desc) }
  scope :due_outbound, -> { where(kind: OUTBOUND_KINDS, status: %w[pending retrying]).where("next_attempt_at <= ?", Time.current) }

  class << self
    def enqueue!(rule:, message:, kind:, recipient: nil, destination: nil, status:, next_attempt_at: nil, delivered_at: nil)
      key = deduplication_key(rule:, message:, kind:, recipient:, destination:)
      create_or_find_by!(deduplication_key: key) do |delivery|
        delivery.user = rule.user
        delivery.message_rule = rule
        delivery.notification_destination = destination
        delivery.inbucket_message = message
        delivery.mailbox = message.mailbox
        delivery.message_id = message.message_id
        delivery.kind = kind
        delivery.recipient = recipient
        delivery.status = status
        delivery.next_attempt_at = next_attempt_at
        delivery.delivered_at = delivered_at
      end
    end

    def claim_due
      transaction do
        return if where(kind: OUTBOUND_KINDS).where("last_attempt_at >= ?", 1.minute.ago).count >= MAXIMUM_OUTBOUND_DELIVERIES_PER_MINUTE

        stale = where(kind: OUTBOUND_KINDS, status: "sending").where("locked_at < ?", 10.minutes.ago)
        stale.update_all(status: "retrying", next_attempt_at: Time.current, locked_at: nil, updated_at: Time.current)
        delivery = due_outbound.order(:next_attempt_at, :id).lock("FOR UPDATE SKIP LOCKED").first
        return unless delivery

        delivery.update!(status: "sending", attempt_count: delivery.attempt_count + 1, locked_at: Time.current, last_attempt_at: Time.current)
        delivery
      end
    end

    def deduplication_key(rule:, message:, kind:, recipient:, destination: nil)
      target = destination ? "destination:#{destination.id}" : recipient.to_s.downcase
      Digest::SHA256.hexdigest([rule.id, message.mailbox, message.message_id, kind, target].join("\u0000"))
    end

    def prune_terminal_records!
      where(status: %w[delivered failed disabled]).where("created_at < ?", TERMINAL_RETENTION.ago).delete_all
    end
  end

  def mark_delivered!
    update!(status: "delivered", delivered_at: Time.current, next_attempt_at: nil, locked_at: nil, error_code: nil)
  end

  def mark_disabled!
    update!(status: "disabled", next_attempt_at: nil, locked_at: nil, error_code: nil)
  end

  def mark_failed!(code)
    update!(status: "failed", failed_at: Time.current, next_attempt_at: nil, locked_at: nil, error_code: code)
  end

  def retry_or_fail!(code)
    attempts = [attempt_count, 1].max
    if attempts >= 3
      mark_failed!(code)
    else
      delay = [1.minute, 5.minutes][attempts - 1]
      update!(status: "retrying", next_attempt_at: Time.current + delay, locked_at: nil, error_code: code)
    end
  end

  def retry!
    return false unless kind.in?(OUTBOUND_KINDS) && status.in?(%w[failed disabled]) && message_rule&.enabled?

    update!(
      status: "retrying",
      attempt_count: 0,
      next_attempt_at: Time.current,
      locked_at: nil,
      failed_at: nil,
      error_code: nil
    )
    true
  end

  def pending_browser?
    kind == "browser" && status == "pending" && message_rule&.enabled?
  end

  def mark_read!
    update!(read_at: Time.current) unless read_at
  end

  def clear!
    update!(cleared_at: Time.current) unless cleared_at
  end

  def rendered
    {
      id:,
      rule_name: message_rule&.name || "Deleted rule",
      mailbox:,
      message_id:,
      kind:,
      status:,
      recipient:,
      created_at: created_at.iso8601(6),
      delivered_at: delivered_at&.iso8601(6),
      read_at: read_at&.iso8601(6),
      error_code:
    }
  end

  private

  def prune_terminal_records
    self.class.prune_terminal_records!
  end
end
