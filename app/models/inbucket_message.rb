class InbucketMessage < ApplicationRecord
  SUMMARY_FIELDS = %w[mailbox id subject from to date size seen posix-millis].freeze
  CHANGE_FIELDS = %i[
    metadata received_at sender recipients subject size seen available unavailable_at
  ].freeze
  TOMBSTONE_RETENTION = 7.days

  has_many :starred_messages, dependent: :destroy
  has_many :trashed_messages, dependent: :destroy
  has_many :message_tags, dependent: :destroy
  has_many :tags, through: :message_tags

  validates :mailbox, :message_id, presence: true
  validates :message_id, uniqueness: { scope: :mailbox }

  scope :available, -> { where(available: true) }
  scope :monitored, -> { where.not(monitor_observed_at: nil) }

  class << self
    def record(header, source:)
      identity = identity_from(header)
      return unless identity

      record_many([header], source:)
      find_by(mailbox: identity.first, message_id: identity.last)
    end

    def record_many(headers, source:)
      observed_at = Time.current
      source_column = source_column(source)
      rows = rows_for(headers, source_column, observed_at)
      return 0 if rows.empty?

      transaction do
        changed_ids = changed_record_ids(rows)
        upsert_rows(rows, source_column)
        where(id: changed_ids).update_all(updated_at: observed_at) if changed_ids.any?
      end
      rows.length
    end

    def reconcile_snapshot(mailbox, headers)
      normalized = normalize_snapshot(mailbox, headers)

      record_many(normalized, source: :scan)
      message_ids = normalized.map { |header| identity_from(header).last }
      removed = mark_snapshot_missing(mailbox, message_ids)
      purge_expired_tombstones
      { indexed: normalized.length, removed: }
    end

    def mark_seen(mailbox, message_id)
      find_by(mailbox:, message_id:)&.mark_seen!
    end

    def mark_unavailable(mailbox, message_id)
      find_by(mailbox:, message_id:)&.mark_unavailable!
    end

    def with_mailbox_lock(mailbox, &)
      transaction do
        quoted_mailbox = connection.quote(mailbox.to_s)
        connection.execute("SELECT pg_advisory_xact_lock(hashtextextended(#{quoted_mailbox}, 0))")
        yield
      end
    end

    private

    def rows_for(headers, source_column, observed_at)
      headers.filter_map do |header|
        attributes = attributes_from(header)
        attributes&.merge(source_column => observed_at, created_at: observed_at, updated_at: observed_at)
      end
    end

    def upsert_rows(rows, source_column)
      upsert_all(
        rows,
        unique_by: "index_inbucket_messages_on_identity",
        update_only: CHANGE_FIELDS + [source_column],
        record_timestamps: false
      )
    end

    def changed_record_ids(rows)
      identities = rows.to_h { |row| [[row.fetch(:mailbox), row.fetch(:message_id)], row] }
      existing = where(
        mailbox: identities.keys.map(&:first).uniq,
        message_id: identities.keys.map(&:last).uniq
      )

      existing.filter_map do |record|
        attributes = identities[[record.mailbox, record.message_id]]
        next unless attributes
        next unless CHANGE_FIELDS.any? { |field| record.public_send(field) != attributes.fetch(field) }

        record.id
      end
    end

    def normalize_snapshot(mailbox, headers)
      headers.map do |header|
        raise InbucketClient::InvalidResponse unless header.is_a?(Hash)

        value = header.deep_stringify_keys
        upstream_mailbox = value["mailbox"].to_s.strip
        raise InbucketClient::InvalidResponse if upstream_mailbox.present? && upstream_mailbox != mailbox

        value.merge("mailbox" => mailbox)
      end
    end

    def mark_snapshot_missing(mailbox, message_ids)
      missing = available.where(mailbox:)
      missing = missing.where.not(message_id: message_ids) if message_ids.any?
      messages = missing.to_a
      messages.each(&:mark_unavailable!)
      messages.length
    end

    def purge_expired_tombstones
      where(available: false).where(unavailable_at: ...TOMBSTONE_RETENTION.ago).delete_all
    end

    def attributes_from(header)
      identity = identity_from(header)
      return unless identity

      value = header.to_h.deep_stringify_keys.slice(*SUMMARY_FIELDS)
      value["mailbox"] = identity.first
      value["id"] = identity.last
      message_attributes(value).merge(mailbox: identity.first, message_id: identity.last)
    end

    def message_attributes(value)
      {
        metadata: value,
        received_at: parse_time(value["date"]),
        sender: value["from"].to_s.presence,
        recipients: Array(value["to"]),
        subject: value["subject"].to_s.presence,
        size: parse_integer(value["size"]),
        seen: seen_value(value["seen"]),
        available: true,
        unavailable_at: nil
      }
    end

    def identity_from(header)
      return unless header.is_a?(Hash)

      value = header.deep_stringify_keys
      mailbox = value["mailbox"].to_s.strip
      message_id = value["id"].to_s.strip
      return if mailbox.empty? || message_id.empty?

      [mailbox, message_id]
    end

    def parse_integer(value)
      Integer(value)
    rescue ArgumentError, TypeError
      nil
    end

    def seen_value(value)
      return true if value == true

      false if value == false
    end

    def parse_time(value)
      Time.zone.parse(value.to_s)
    rescue ArgumentError, TypeError
      nil
    end

    def source_column(source)
      return :monitor_observed_at if source == :monitor
      return :scan_observed_at if source == :scan
      return :direct_observed_at if source == :direct

      raise ArgumentError, "unsupported message source"
    end
  end

  def rendered_summary(starred: false, seen: self.seen, tags: [])
    metadata.merge(
      "mailbox" => mailbox,
      "id" => message_id,
      "seen" => seen,
      "starred" => starred,
      "tags" => tags
    )
  end

  def mark_seen!
    update!(seen: true, metadata: metadata.merge("seen" => true))
  end

  def mark_unavailable!
    return unless available?

    transaction do
      starred_messages.destroy_all
      message_tags.destroy_all
      update!(available: false, unavailable_at: Time.current)
    end
  end
end
