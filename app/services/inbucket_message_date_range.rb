require "time"

class InbucketMessageDateRange
  class InvalidRequest < StandardError; end

  def initialize(params)
    @received_after = parse(params[:received_after])
    @received_before = parse(params[:received_before])
    raise InvalidRequest if received_after && received_before && received_after >= received_before
  end

  def apply(relation)
    relation = relation.where("inbucket_messages.received_at >= ?", received_after) if received_after
    relation = relation.where("inbucket_messages.received_at < ?", received_before) if received_before

    relation
  end

  private

  attr_reader :received_after, :received_before

  def parse(value)
    return if value.blank?

    Time.iso8601(value)
  rescue ArgumentError, TypeError
    raise InvalidRequest
  end
end
