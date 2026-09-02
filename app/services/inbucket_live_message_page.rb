require "base64"

class InbucketLiveMessagePage
  DEFAULT_LIMIT = 100
  MAX_LIMIT = 200

  class InvalidRequest < StandardError; end

  def initialize(user:, params:)
    @user = user
    @params = params
  end

  def call
    return bootstrap if params[:cursor].blank?

    records = changed_records
    trashed_ids = user.trashed_messages.where(inbucket_message_id: records.map(&:id)).pluck(:inbucket_message_id).to_set
    page = records.first(limit)
    summaries = page.map(&:rendered_summary)
    starred = StarredMessage.lookup(user:, messages: summaries)
    tags = Tag.lookup(user:, messages: summaries)
    archived = Mailbox.where(name: page.map(&:mailbox).uniq).pluck(:name, :archived).to_h

    {
      changes: page.filter_map do |record|
        next if record.available? && trashed_ids.include?(record.id)
        message = record.rendered_summary(
          starred: starred.key?([record.mailbox, record.message_id]),
          tags: tags.fetch([record.mailbox, record.message_id], [])
        )
        {
          mailbox: record.mailbox,
          id: record.message_id,
          available: record.available?,
          created: record.created_at == record.updated_at,
          archived: archived.fetch(record.mailbox, false),
          message:
        }
      end,
      cursor: page.any? ? encode_cursor(page.last.updated_at, page.last.id) : params[:cursor],
      has_more: records.length > limit
    }
  end

  private

  attr_reader :user, :params

  def bootstrap
    transaction_options = InbucketMessage.connection.transaction_open? ? {} : { isolation: :repeatable_read }
    InbucketMessage.transaction(**transaction_options) do
      latest = InbucketMessage.order(updated_at: :desc, id: :desc).first
      timestamp = latest&.updated_at || Time.current
      {
        changes: [],
        active_mailboxes: Mailbox.active.order(:name).pluck(:name),
        cursor: encode_cursor(timestamp, latest&.id || 0),
        has_more: false
      }
    end
  end

  def changed_records
    timestamp, id = decode_cursor
    InbucketMessage
      .where("updated_at > ? OR (updated_at = ? AND id > ?)", timestamp, timestamp, id)
      .order(:updated_at, :id)
      .limit(limit + 1)
      .to_a
  end

  def decode_cursor
    decoded = JSON.parse(Base64.urlsafe_decode64(params[:cursor].to_s))
    raise InvalidRequest unless decoded.is_a?(Hash)

    [Time.iso8601(decoded.fetch("updated_at")), Integer(decoded.fetch("id"))]
  rescue JSON::ParserError, KeyError, ArgumentError, TypeError
    raise InvalidRequest
  end

  def encode_cursor(timestamp, id)
    Base64.urlsafe_encode64(
      { updated_at: timestamp.iso8601(6), id: }.to_json,
      padding: false
    )
  end

  def limit
    value = params[:limit].presence ? Integer(params[:limit]) : DEFAULT_LIMIT
    raise InvalidRequest unless value.between?(1, MAX_LIMIT)

    value
  rescue ArgumentError, TypeError
    raise InvalidRequest
  end
end
