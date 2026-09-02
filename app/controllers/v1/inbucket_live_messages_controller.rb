module V1
  class InbucketLiveMessagesController < InbucketController
    def index
      render json: InbucketLiveMessagePage.new(user: current_user, params:).call
    rescue InbucketLiveMessagePage::InvalidRequest
      render json: { error: "invalid_request" }, status: :unprocessable_content
    end
  end
end
