module V1
  class InbucketMessageTagsController < InbucketController
    def update
      tag = current_user.tags.find(params.require(:tag_id))
      assigned = assigned_value
      result = assignment(tag, assigned).call
      return render_upstream(result.response, json: true) unless successful?(result.response)

      render json: { assigned:, tags: result.tags }
    end

    private

    def assigned_value
      value = params.require(:assigned)
      return value if [true, false].include?(value)

      raise ActionController::ParameterMissing, :assigned
    end

    def assignment(tag, assigned)
      MessageTagAssignment.new(
        user: current_user,
        client: inbucket,
        identity: { mailbox: params.require(:name), message_id: params.require(:id) },
        tag:,
        assigned:
      )
    end

    def successful?(response)
      response.status.between?(200, 299)
    end
  end
end
