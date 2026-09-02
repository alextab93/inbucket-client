require "base64"

class InbucketMessagePage
  DEFAULT_LIMIT = 30
  MAX_LIMIT = 100
  SORTS = {
    "newest" => %i[received_at desc],
    "oldest" => %i[received_at asc],
    "largest" => %i[size desc],
    "smallest" => %i[size asc]
  }.freeze

  class InvalidRequest < StandardError; end

  def initialize(user:, mailboxes:, params:)
    @user = user
    @mailboxes = mailboxes
    @params = params
  end

  def call
    relation = filtered_relation
    records = page_records(relation)
    page = records.first(limit)
    summaries = page.map(&:rendered_summary)
    starred = StarredMessage.lookup(user:, messages: summaries)
    tags = Tag.lookup(user:, messages: summaries)

    {
      messages: summaries.map { |message| with_user_state(message, starred, tags) },
      next_cursor: records.length > limit ? encode_cursor(page.last) : nil,
      total_count: relation.count
    }
  end

  private

  attr_reader :user, :mailboxes, :params

  def filtered_relation
    relation = InbucketMessage.available.where(mailbox: mailboxes)
                               .where.not(id: user.trashed_messages.select(:inbucket_message_id))
    relation = InbucketMessageDateRange.new(params).apply(relation)
    relation = filter_seen(relation)
    relation = filter_search(relation)
    filter_tag(relation)
  end

  def page_records(relation)
    relation = apply_cursor(relation)
    relation.order(
      Arel.sql(
        "#{sort_column} #{sort_direction.upcase} NULLS LAST, " \
        "inbucket_messages.id #{sort_direction.upcase}"
      )
    )
            .limit(limit + 1)
            .to_a
  end

  def filter_seen(relation)
    case params[:read]
    when nil, "", "all"
      relation
    when "read"
      relation.where(seen: true)
    when "unread"
      relation.where.not(seen: true)
    else
      raise InvalidRequest
    end
  end

  def filter_search(relation)
    query = params[:search].to_s.strip
    return relation if query.empty?

    pattern = "%#{ActiveRecord::Base.sanitize_sql_like(query)}%"
    relation.where("inbucket_messages.metadata::text ILIKE ?", pattern)
  end

  def filter_tag(relation)
    value = params[:tag].to_s
    return relation if value.empty?

    tag = user.tags.find(Integer(value))
    relation.joins(:message_tags).where(message_tags: { tag_id: tag.id }).distinct
  rescue ActiveRecord::RecordNotFound, ArgumentError, TypeError
    raise InvalidRequest
  end

  def apply_cursor(relation)
    cursor = decoded_cursor
    return relation unless cursor

    value = cursor.fetch("value")
    id = Integer(cursor.fetch("id"))
    comparison = sort_direction == :desc ? "<" : ">"
    return relation.where(sort_column => nil).where("inbucket_messages.id #{comparison} ?", id) if value.nil?

    parsed = parse_cursor_value(value)
    relation.where(cursor_predicate(comparison), value: parsed, id:)
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

  def cursor_predicate(comparison)
    <<~SQL.squish
      #{sort_column} #{comparison} :value OR
      #{sort_column} IS NULL OR
      (#{sort_column} = :value AND inbucket_messages.id #{comparison} :id)
    SQL
  end

  def encode_cursor(record)
    value = record.public_send(sort_column)
    value = value.iso8601(6) if value.respond_to?(:iso8601)
    Base64.urlsafe_encode64({ sort: sort_name, value:, id: record.id }.to_json, padding: false)
  end

  def parse_cursor_value(value)
    return Integer(value) if sort_column == :size

    Time.iso8601(value)
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

  def with_user_state(message, starred, tags)
    key = [message["mailbox"].to_s, message["id"].to_s]
    message.merge("starred" => starred.key?(key), "tags" => tags.fetch(key, []))
  end
end
