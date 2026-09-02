require "base64"

class InbucketTrashMessagePage
  DEFAULT_LIMIT = 30
  MAX_LIMIT = 100
  SORTS = InbucketMessagePage::SORTS

  class InvalidRequest < StandardError; end

  def initialize(user:, params:)
    @user = user
    @params = params
  end

  def call
    relation = filtered_relation
    records = page_records(relation)
    page = records.first(limit)
    {
      messages: TrashedMessage.rendered_summaries(user:, records: page),
      next_cursor: records.length > limit ? encode_cursor(page.last) : nil,
      total_count: relation.count,
      trash_count: user.trashed_messages.count,
      mailboxes: user.trashed_messages.joins(:inbucket_message)
                     .distinct.order("inbucket_messages.mailbox")
                     .pluck("inbucket_messages.mailbox")
    }
  end

  private

  attr_reader :user, :params

  def filtered_relation
    relation = user.trashed_messages.joins(:inbucket_message).includes(:inbucket_message)
    relation = filter_seen(relation)
    relation = filter_mailbox(relation)
    filter_search(relation)
  end

  def filter_seen(relation)
    case params[:read]
    when nil, "", "all"
      relation
    when "read"
      relation.where(inbucket_messages: { seen: true })
    when "unread"
      relation.where.not(inbucket_messages: { seen: true })
    else
      raise InvalidRequest
    end
  end

  def filter_mailbox(relation)
    mailbox = params[:mailbox].to_s.strip
    mailbox.empty? ? relation : relation.where(inbucket_messages: { mailbox: })
  end

  def filter_search(relation)
    query = params[:search].to_s.strip
    return relation if query.empty?

    pattern = "%#{ActiveRecord::Base.sanitize_sql_like(query)}%"
    relation.where("inbucket_messages.metadata::text ILIKE ?", pattern)
  end

  def page_records(relation)
    relation = apply_cursor(relation)
    relation.order(
      Arel.sql(
        "inbucket_messages.#{sort_column} #{sort_direction.upcase} NULLS LAST, " \
        "trashed_messages.id #{sort_direction.upcase}"
      )
    ).limit(limit + 1).to_a
  end

  def apply_cursor(relation)
    cursor = decoded_cursor
    return relation unless cursor

    value = cursor.fetch("value")
    id = Integer(cursor.fetch("id"))
    comparison = sort_direction == :desc ? "<" : ">"
    column = "inbucket_messages.#{sort_column}"
    return relation.where(inbucket_messages: { sort_column => nil }).where("trashed_messages.id #{comparison} ?", id) if value.nil?

    parsed = sort_column == :size ? Integer(value) : Time.iso8601(value)
    relation.where(
      "#{column} #{comparison} :value OR #{column} IS NULL OR " \
      "(#{column} = :value AND trashed_messages.id #{comparison} :id)",
      value: parsed,
      id:
    )
  rescue KeyError, ArgumentError, TypeError
    raise InvalidRequest
  end

  def decoded_cursor
    value = params[:cursor].to_s
    return if value.empty?

    decoded = JSON.parse(Base64.urlsafe_decode64(value))
    raise InvalidRequest unless decoded.is_a?(Hash) && decoded["sort"] == sort_name

    decoded
  rescue JSON::ParserError, ArgumentError
    raise InvalidRequest
  end

  def encode_cursor(record)
    message = record.inbucket_message
    value = message.public_send(sort_column)
    value = value.iso8601(6) if value.respond_to?(:iso8601)
    Base64.urlsafe_encode64({ sort: sort_name, value:, id: record.id }.to_json, padding: false)
  end

  def sort_name
    value = params[:sort].presence || "newest"
    raise InvalidRequest unless SORTS.key?(value)

    value
  end

  def sort_column
    SORTS.fetch(sort_name).first
  end

  def sort_direction
    SORTS.fetch(sort_name).last
  end

  def limit
    value = params[:limit].presence ? Integer(params[:limit]) : DEFAULT_LIMIT
    raise InvalidRequest unless value.between?(1, MAX_LIMIT)

    value
  rescue ArgumentError, TypeError
    raise InvalidRequest
  end
end
