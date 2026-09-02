require "mail"

module V1
  class InbucketMessagesController < InbucketController
    INLINE_IMAGE_TYPES = %w[image/avif image/bmp image/gif image/jpeg image/png image/webp].freeze

    def index
      mailboxes = requested_mailboxes
      partial_mailboxes = refresh_mailboxes(mailboxes)
      page = InbucketMessagePage.new(user: current_user, mailboxes:, params:).call
      render json: page.merge(partial_mailboxes:)
    rescue InbucketMessagePage::InvalidRequest, InbucketMessageDateRange::InvalidRequest
      render json: { error: "invalid_request" }, status: :unprocessable_content
    end

    def show
      name = params.require(:name)
      id = params.require(:id)
      upstream = inbucket.message(name, id)
      return render_upstream(upstream, json: true) unless upstream.status.between?(200, 299)
      raise InbucketClient::InvalidResponse unless upstream.body.is_a?(Hash)

      indexed = indexed_message(name, id, upstream.body)
      starred = current_user.starred_messages.exists?(inbucket_message: indexed)
      tags = tags_for(indexed)
      render json: upstream.body.merge("starred" => starred, "tags" => tags), status: upstream.status
    end

    def mark_read
      name = params.require(:name)
      id = params.require(:id)
      upstream = inbucket.mark_seen(name, id)
      InbucketMessage.mark_seen(name, id) if upstream.status.between?(200, 299)
      render_destroy_upstream(upstream)
    end

    def starred
      records = current_user.starred_messages
                            .includes(:inbucket_message)
                            .joins(:inbucket_message)
                            .merge(InbucketMessage.available)
                            .where.not(inbucket_message_id: current_user.trashed_messages.select(:inbucket_message_id))
                            .order(updated_at: :desc)
      records = InbucketMessageDateRange.new(params).apply(records)
      summaries = records.map do |record|
        record.inbucket_message.rendered_summary(starred: true)
      end
      tags = Tag.lookup(user: current_user, messages: summaries)
      render json: summaries.map { |message| with_tags(message, tags) }
    rescue InbucketMessageDateRange::InvalidRequest
      render json: { error: "invalid_request" }, status: :unprocessable_content
    end

    def update_starred
      name = params.require(:name)
      id = params.require(:id)
      value = params.require(:starred)
      unless [true, false].include?(value)
        return render json: { error: "invalid_request" }, status: :unprocessable_content
      end

      return remove_star(name, id) unless value

      add_star(name, id)
    end

    def source
      response = inbucket.source(params.require(:name), params.require(:id))
      return render_upstream(response) unless response.status.between?(200, 299)

      render plain: response.body, content_type: "text/plain", status: response.status
    end

    def inline_image
      response = inbucket.source(params.require(:name), params.require(:id))
      return render_upstream(response) unless response.status.between?(200, 299)

      part = Mail.read_from_string(response.body).all_parts.find do |candidate|
        candidate.content_id.to_s.delete_prefix("<").delete_suffix(">").casecmp?(params.require(:cid)) && INLINE_IMAGE_TYPES.include?(candidate.mime_type)
      end
      return head :not_found unless part

      send_data part.decoded, type: part.mime_type, disposition: "inline"
    rescue Mail::Field::ParseError
      head :not_found
    end

    def attachments
      response = inbucket.source(params.require(:name), params.require(:id))
      return render_upstream(response) unless response.status.between?(200, 299)

      render json: attachment_parts(response.body).each_with_index.map { |part, index| attachment_metadata(part, index) }
    rescue Mail::Field::ParseError
      render json: { error: "invalid_message_source" }, status: :unprocessable_content
    end

    def attachment
      response = inbucket.source(params.require(:name), params.require(:id))
      return render_upstream(response) unless response.status.between?(200, 299)

      part = attachment_parts(response.body).fetch(Integer(params.require(:index), 10))
      self.response.headers["X-Content-Type-Options"] = "nosniff"
      send_data part.decoded, type: part.mime_type || "application/octet-stream", filename: part.filename || "attachment", disposition: "attachment"
    rescue Mail::Field::ParseError, ArgumentError, IndexError
      head :not_found
    end

    def destroy
      name = params.require(:name)
      id = params.require(:id)
      upstream = inbucket.delete_message(name, id)
      if upstream.status.between?(200, 299)
        InbucketMessage.with_mailbox_lock(name) do
          InbucketMessage.find_by(mailbox: name, message_id: id)&.destroy!
        end
      end
      render_destroy_upstream(upstream)
    end

    private

    def requested_mailboxes
      names = Array(params[:mailboxes]).map { |name| name.to_s.strip }.reject(&:empty?).uniq
      raise InbucketMessagePage::InvalidRequest if names.empty? || names.length > 50

      names
    end

    def refresh_mailboxes(mailboxes)
      return [] unless params[:refresh] == "true" && params[:cursor].blank?

      mailboxes.filter_map do |mailbox|
        result = InbucketMailboxSync.new(client: inbucket).call(mailbox)
        mailbox unless result.response.status.between?(200, 299)
      rescue InbucketClient::Unavailable, InbucketClient::InvalidResponse
        mailbox
      end
    end

    def add_star(name, id)
      upstream, record = InbucketMessage.with_mailbox_lock(name) do
        response = inbucket.message(name, id)
        next [response] unless response.status.between?(200, 299)
        raise InbucketClient::InvalidResponse unless response.body.is_a?(Hash)

        indexed = record_indexed_message(name, id, response.body)
        starred = current_user.starred_messages.find_or_create_by!(inbucket_message: indexed)
        [response, starred]
      end
      return render_upstream(upstream, json: true) unless upstream.status.between?(200, 299)

      render json: { starred: true, message: record.rendered_summary }
    end

    def remove_star(name, id)
      current_user.starred_messages
                  .joins(:inbucket_message)
                  .where(inbucket_messages: { mailbox: name, message_id: id })
                  .destroy_all
      render json: { starred: false }
    end

    def indexed_message(name, id, body)
      InbucketMessage.with_mailbox_lock(name) { record_indexed_message(name, id, body) }
    end

    def tags_for(message)
      current_user.tags.joins(:message_tags)
                  .where(message_tags: { inbucket_message: message })
                  .ordered
                  .map(&:rendered)
    end

    def with_tags(message, tags)
      key = [message["mailbox"], message["id"]]
      message.merge("tags" => tags.fetch(key, []))
    end

    def record_indexed_message(name, id, body)
      Mailbox.record(name)
      existing = InbucketMessage.find_by(mailbox: name, message_id: id)
      if existing&.available?
        existing.update_column(:direct_observed_at, Time.current)
        return existing
      end

      InbucketMessage.record(body.merge("mailbox" => name, "id" => id), source: :direct)
    end

    def attachment_parts(source)
      Mail.read_from_string(source).all_parts.select(&:attachment?)
    end

    def attachment_metadata(part, index)
      {
        index:,
        filename: part.filename || "attachment",
        content_type: part.mime_type || "application/octet-stream",
        size: part.decoded.bytesize,
      }
    end
  end
end
