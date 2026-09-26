module V1
  class InternalRuleEventsController < ActionController::API
    def create
      return head :unauthorized unless valid_token?

      revision = params[:revision].to_s
      RuleLuaScript.activate!(revision)
      message = InbucketMessage.find_by(mailbox: params[:mailbox].to_s, message_id: params[:id].to_s)
      MessageRuleEvaluator.new(message:).call if message
      head :accepted
    rescue StandardError => error
      Rails.logger.error("lua event processing failed: #{error.class}")
      head :accepted
    end

    private

    def valid_token?
      expected = ENV["LUA_EVENT_TOKEN"].to_s
      supplied = request.headers["X-Inbucket-Event-Token"].to_s
      expected.present? && supplied.bytesize == expected.bytesize && ActiveSupport::SecurityUtils.secure_compare(supplied, expected)
    end
  end
end
