module V1
  class InbucketMailboxesController < InbucketController
    def index
      mailboxes = Mailbox.archived.order(:name)
      return render json: Mailbox.active.order(:name).pluck(:name) unless params[:archived] == "true"

      render json: mailboxes.map { |mailbox| archived_mailbox(mailbox) }
    end

    def show
      name = params.require(:name)
      Mailbox.find_by(name: name)&.update!(archived: false)
      result = InbucketMailboxSync.new(client: inbucket).call(name)
      upstream = result.response
      return render_upstream(upstream, json: true) unless mailbox_response?(upstream)

      messages = messages_with_starred_state(upstream.body, name)
      render json: messages, status: upstream.status
    end

    def destroy
      name = params.require(:name)
      upstream = inbucket.purge_mailbox(name)
      if upstream.status.between?(200, 299)
        InbucketMessage.with_mailbox_lock(name) { Mailbox.where(name: name).destroy_all }
      end
      render_destroy_upstream(upstream)
    end

    def archive
      mailbox = Mailbox.find_by!(name: params.require(:name))
      mailbox.update!(archived: params[:archived] != "false")
      head :no_content
    end

    private

    def mailbox_response?(response)
      response.status.between?(200, 299) && response.body.is_a?(Array)
    end

    def messages_with_starred_state(messages, mailbox)
      candidates = messages.map do |message|
        message.is_a?(Hash) ? message.merge("mailbox" => mailbox) : message
      end
      starred = StarredMessage.lookup(user: current_user, messages: candidates)
      tags = Tag.lookup(user: current_user, messages: candidates)
      messages.map { |message| message_with_user_state(message, mailbox, starred, tags) }
    end

    def message_with_user_state(message, mailbox, starred, tags)
      return message unless message.is_a?(Hash)

      key = [mailbox, message["id"].to_s]
      message.merge("starred" => starred.key?(key), "tags" => tags.fetch(key, []))
    end

    def archived_mailbox(mailbox)
      response = inbucket.mailbox(mailbox.name)
      message_count = response.status.between?(200, 299) && response.body.is_a?(Array) ? response.body.length : nil
      { name: mailbox.name, message_count: }
    rescue InbucketClient::Unavailable, InbucketClient::InvalidResponse
      { name: mailbox.name, message_count: nil }
    end
  end
end
