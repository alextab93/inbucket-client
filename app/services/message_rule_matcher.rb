class MessageRuleMatcher
  def initialize(rule:, message:, attachment_lookup: nil, now: Time.current)
    @rule = rule
    @message = message
    @attachment_lookup = attachment_lookup
    @now = now.utc
  end

  def matches?
    conditions = @rule.conditions
    return false unless matches_list?(conditions.fetch("mailboxes", []), @message.mailbox)
    return false unless matches_list?(conditions.fetch("senders", []), @message.sender)
    return false unless matches_recipients?(conditions.fetch("recipients", []))
    return false unless matches_subject?(conditions["subject"])
    return false unless matches_size?(conditions)
    return false unless matches_tags?(conditions.fetch("tag_ids", []))
    return false unless matches_time_windows?(conditions.fetch("time_windows", []))
    return false unless matches_attachments?(conditions)

    true
  end

  private

  def matches_list?(terms, value)
    return true if terms.empty?

    normalized = value.to_s.downcase
    terms.any? { |term| normalized.include?(term) }
  end

  def matches_recipients?(terms)
    return true if terms.empty?

    recipients = Array(@message.recipients).map { |recipient| recipient.to_s.downcase }
    recipients.any? { |recipient| terms.any? { |term| recipient.include?(term) } }
  end

  def matches_subject?(term)
    term.blank? || @message.subject.to_s.downcase.include?(term)
  end

  def matches_size?(conditions)
    size = @message.size
    return false if size.nil? && (conditions["minimum_size"] || conditions["maximum_size"])
    return false if conditions["minimum_size"] && size < conditions["minimum_size"]
    return false if conditions["maximum_size"] && size > conditions["maximum_size"]

    true
  end

  def matches_tags?(tag_ids)
    return true if tag_ids.empty?

    @rule.user.tags.joins(:message_tags).where(id: tag_ids, message_tags: { inbucket_message_id: @message.id }).exists?
  end

  def matches_time_windows?(windows)
    return true if windows.empty?

    windows.any? do |window|
      minute = @now.hour * 60 + @now.min
      start = minutes(window.fetch("start"))
      finish = minutes(window.fetch("finish"))
      days = window.fetch("days")
      if start <= finish
        days.include?(@now.wday) && minute.between?(start, finish)
      else
        (days.include?(@now.wday) && minute >= start) ||
          (days.include?(previous_day) && minute <= finish)
      end
    end
  end

  def previous_day
    (@now.wday - 1) % 7
  end

  def matches_attachments?(conditions)
    return true unless conditions.key?("has_attachments")
    return false unless @attachment_lookup

    @attachment_lookup.call(@message) == conditions["has_attachments"]
  end

  def minutes(value)
    hour, minute = value.split(":").map(&:to_i)
    hour * 60 + minute
  end
end
