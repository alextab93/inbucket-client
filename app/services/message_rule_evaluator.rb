class MessageRuleEvaluator
  def initialize(message:, now: Time.current, attachment_lookup: RuleAttachmentLookup.new)
    @message = message
    @now = now
    @attachment_lookup = attachment_lookup
  end

  def call
    MessageRule.includes(:user).where(enabled: true).ordered.find_each do |rule|
      evaluate(rule)
      rule.clear_failure!
    rescue StandardError => error
      rule.record_failure!(error)
      Rails.logger.error("message rule evaluation failed: #{error.class}")
    end
  end

  private

  def evaluate(rule)
    return unless MessageRuleMatcher.new(
      rule:,
      message: @message,
      attachment_lookup: method(:attachments),
      now: @now,
    ).matches?
    return if cooling_down?(rule)

    rule.update_column(:last_triggered_at, @now)
    enqueue_actions(rule)
  end

  def cooling_down?(rule)
    return false if rule.cooldown_seconds.zero?

    rule.last_triggered_at && rule.last_triggered_at >= @now - rule.cooldown_seconds.seconds
  end

  def enqueue_actions(rule)
    NotificationDelivery.enqueue!(
      rule:,
      message: @message,
      kind: "in_app",
      status: "delivered",
      delivered_at: @now,
    ) if rule.actions["in_app"]
    NotificationDelivery.enqueue!(
      rule:,
      message: @message,
      kind: "browser",
      status: "pending",
    ) if rule.actions["browser"]
    rule.user.notification_destinations.where(id: rule.destination_ids).find_each do |destination|
      destination.kinds.each do |kind|
        status = kind == "email" && NotificationSmtpConfiguration.from_env.disabled? ? "disabled" : "pending"
        NotificationDelivery.enqueue!(
          rule:,
          message: @message,
          kind:,
          destination:,
          recipient: destination.delivery_label(kind),
          status:,
          next_attempt_at: @now,
        )
      end
    end
    rule.user.starred_messages.find_or_create_by!(inbucket_message: @message) if rule.actions["star"]
    rule.user.tags.where(id: rule.action_tag_ids).find_each do |tag|
      tag.message_tags.find_or_create_by!(inbucket_message: @message)
    end
    mark_read if rule.actions["mark_read"]
    move_to_trash(rule) if rule.actions["move_to_trash"]
  end

  def mark_read
    return if @message.seen?

    response = InbucketClient.new.mark_seen(@message.mailbox, @message.message_id)
    raise InbucketClient::InvalidResponse unless response.status.between?(200, 299)

    @message.mark_seen!
  end

  def move_to_trash(rule)
    rule.user.trashed_messages.find_or_create_by!(inbucket_message: @message) do |trash|
      trash.trashed_at = @now
    end
  end

  def attachments(message)
    @attachments ||= {}
    @attachments.fetch(message.id) { @attachments[message.id] = @attachment_lookup.call(message) }
  end
end
