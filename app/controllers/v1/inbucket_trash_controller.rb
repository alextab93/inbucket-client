module V1
  class InbucketTrashController < InbucketController
    def index
      render json: InbucketTrashMessagePage.new(user: current_user, params:).call
    rescue InbucketTrashMessagePage::InvalidRequest
      render json: { error: "invalid_request" }, status: :unprocessable_content
    end

    def update
      name = params.require(:name)
      id = params.require(:id)
      trashed = params.require(:trashed)
      return render json: { error: "invalid_request" }, status: :unprocessable_content unless [true, false].include?(trashed)

      result = InbucketMessage.with_mailbox_lock(name) do
        record = InbucketMessage.find_by(mailbox: name, message_id: id)
        next unless record

        if trashed
          next unless record.available?

          trash = current_user.trashed_messages.find_or_create_by!(inbucket_message: record) do |value|
            value.trashed_at = Time.current
          end
          { trashed: true, message: trash.rendered_summary }
        else
          current_user.trashed_messages.where(inbucket_message: record).destroy_all
          { trashed: false, available: record.available? }
        end
      end
      return render json: { error: "not_found" }, status: :not_found unless result

      render json: result
    end

    def destroy
      results = current_user.trashed_messages.ordered.map do |trash|
        delete_trash(trash)
      end
      render json: { results: }
    end

    private

    def delete_trash(trash)
      message = trash.inbucket_message
      response = inbucket.delete_message(message.mailbox, message.message_id)
      deleted = response.status.between?(200, 299)
      InbucketMessage.with_mailbox_lock(message.mailbox) { message.destroy! } if deleted
      {
        mailbox: message.mailbox,
        id: message.message_id,
        deleted:,
        error: deleted ? nil : upstream_error(response)
      }
    rescue InbucketClient::Unavailable, InbucketClient::InvalidResponse
      { mailbox: message.mailbox, id: message.message_id, deleted: false, error: "inbucket_unavailable" }
    end

    def upstream_error(response)
      response.status == 404 ? "not_found" : "inbucket_error"
    end
  end
end
