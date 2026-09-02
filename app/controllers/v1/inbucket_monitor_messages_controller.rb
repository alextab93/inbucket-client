module V1
  class InbucketMonitorMessagesController < InbucketController
    def index
      relation = InbucketMessageDateRange.new(params).apply(InbucketMessage.monitored)
      messages = relation.order(received_at: :desc, id: :desc).limit(200).to_a
      summaries = messages.map(&:rendered_summary)
      render json: summaries_with_user_state(summaries)
    rescue InbucketMessageDateRange::InvalidRequest
      render json: { error: "invalid_request" }, status: :unprocessable_content
    end

    private

    def summaries_with_user_state(summaries)
      starred = StarredMessage.lookup(user: current_user, messages: summaries)
      tags = Tag.lookup(user: current_user, messages: summaries)
      summaries.map do |message|
        key = [message["mailbox"].to_s, message["id"].to_s]
        message.merge("starred" => starred.key?(key), "tags" => tags.fetch(key, []))
      end
    end
  end
end
