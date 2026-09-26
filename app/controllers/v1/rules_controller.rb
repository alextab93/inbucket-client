module V1
  class RulesController < InbucketController
    rescue_from ActiveRecord::RecordNotUnique, with: :render_conflict

    def index
      render json: {
        rules: current_user.message_rules.ordered.map(&:rendered),
        lua: lua_state,
      }
    end

    def create
      rule = current_user.message_rules.new(rule_attributes)
      return render_invalid(rule) unless rule.save

      render json: rule.rendered.merge(lua: lua_state), status: :created
    end

    def update
      rule = current_user.message_rules.find(params.require(:id))
      return render_invalid(rule) unless rule.update(rule_attributes)

      render json: rule.rendered.merge(lua: lua_state)
    end

    def destroy
      current_user.message_rules.find(params.require(:id)).destroy!
      head :no_content
    end

    def duplicate
      source = current_user.message_rules.find(params.require(:id))
      copy = current_user.message_rules.new(
        name: duplicate_name(source.name),
        enabled: false,
        priority: source.priority,
        cooldown_seconds: source.cooldown_seconds,
        schema_version: source.schema_version,
        conditions: source.conditions,
        actions: source.actions,
      )
      copy.save!
      render json: copy.rendered.merge(lua: lua_state), status: :created
    end

    def preview
      rule = current_user.message_rules.build(
        conditions: MessageRuleSchema.conditions(params.fetch(:conditions, {}))
      )

      messages = InbucketMessage.available.order(received_at: :desc, id: :desc).limit(100)
      attachment_lookup = RuleAttachmentLookup.new
      incomplete = false
      matches = messages.filter_map do |message|
        matched = MessageRuleMatcher.new(
          rule:,
          message:,
          attachment_lookup: lambda do |candidate|
            value = attachment_lookup.call(candidate)
            incomplete = true if value.nil?
            value
          end,
          now: Time.current,
        ).matches?
        next unless matched

        {
          mailbox: message.mailbox,
          message_id: message.message_id,
          subject: message.subject,
          sender: message.sender,
          recipients: message.recipients,
          received_at: message.received_at&.iso8601(6),
          size: message.size
        }
      end
      render json: { matches:, inspected: messages.length, incomplete: }
    rescue MessageRuleSchema::Invalid => error
      render json: { error: "invalid_rule", fields: { conditions: [error.message] } }, status: :unprocessable_content
    end

    private

    def rule_attributes
      attributes = params.permit(:name, :enabled, :priority, :cooldown_seconds, :schema_version, conditions: {}, actions: [:in_app, :browser, :star, :mark_read, :move_to_trash, { destination_ids: [], tag_ids: [] }]).to_h
      raise ActionController::ParameterMissing, :rule if attributes.empty?

      attributes
    end

    def render_invalid(rule)
      render json: { error: "invalid_rule", fields: rule.errors.to_hash }, status: :unprocessable_content
    end

    def render_conflict
      render json: { error: "invalid_rule", fields: { name: ["has already been taken"] } }, status: :conflict
    end

    def duplicate_name(name)
      base = "Copy of #{name}".first(80)
      candidate = base
      suffix = 2
      while current_user.message_rules.where("lower(name) = ?", candidate.downcase).exists?
        candidate = "#{base.first(76)} #{suffix}"
        suffix += 1
      end
      candidate
    end

    def lua_state
      state = RuleLuaState.order(:id).first
      {
        desired_revision: state&.desired_revision || RuleLuaScript.revision,
        active_revision: state&.active_revision,
        active: state.present? && state.desired_revision == state.active_revision,
        last_error_code: state&.last_error_code,
        last_failed_at: state&.last_failed_at&.iso8601(6),
      }
    end
  end
end
