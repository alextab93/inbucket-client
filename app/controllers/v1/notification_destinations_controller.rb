module V1
  class NotificationDestinationsController < InbucketController
    rescue_from ActiveRecord::RecordNotUnique, with: :render_conflict

    def index
      render json: {
        destinations: current_user.notification_destinations.ordered.map(&:rendered),
        defaults: destination_defaults
      }
    end

    def create
      destination = current_user.notification_destinations.new(destination_attributes)
      return render_invalid(destination) unless destination.save

      render json: destination.rendered, status: :created
    end

    def update
      destination = current_user.notification_destinations.find(params.require(:id))
      return render_invalid(destination) unless destination.update(destination_attributes(destination:))

      render json: destination.rendered
    end

    def destroy
      current_user.notification_destinations.find(params.require(:id)).destroy!
      head :no_content
    end

    def test_delivery
      destination = current_user.notification_destinations.find(params.require(:id))
      kind = params.require(:kind).to_s
      NotificationDestinationTestSender.new(destination:, kind:).deliver!
      render json: {
        kind:,
        message: "Test #{kind == "ntfy" ? kind : kind.capitalize} notification sent."
      }
    rescue NotificationDestinationTestSender::InvalidMethod
      render json: { error: "invalid_delivery_method" }, status: :unprocessable_content
    rescue NotificationDestinationTestSender::DeliveryFailed => error
      render json: { error: error.code }, status: :bad_gateway
    end

    private

    def destination_defaults
      {
        ntfy_host: most_recent_method("ntfy")&.[]("host"),
        webhook_url: most_recent_method("webhook")&.[]("url")
      }.compact
    end

    def most_recent_method(kind)
      destination = current_user.notification_destinations
        .where("methods @> ?", [{ kind: }].to_json)
        .reorder(updated_at: :desc, id: :desc)
        .first
      destination&.delivery_method(kind)
    end

    def destination_attributes(destination: nil)
      attributes = params.permit(
        :name,
        methods: [
          :kind,
          :host,
          :topic,
          :token,
          :url,
          :method,
          :body,
          { recipients: [], headers: %i[name value] }
        ]
      ).to_h
      raise ActionController::ParameterMissing, :notification_destination if attributes.empty?

      preserve_ntfy_token(destination, attributes)
    end

    def preserve_ntfy_token(destination, attributes)
      existing_token = destination&.delivery_method("ntfy")&.[]("token")
      return attributes unless existing_token.present?

      attributes.merge(
        "methods" => attributes.fetch("methods", []).map do |method|
          method["kind"] == "ntfy" && method["token"].blank? ? method.merge("token" => existing_token) : method
        end
      )
    end

    def render_invalid(destination)
      render json: { error: "invalid_notification_destination", fields: destination.errors.to_hash }, status: :unprocessable_content
    end

    def render_conflict
      render json: { error: "invalid_notification_destination", fields: { name: ["has already been taken"] } }, status: :conflict
    end
  end
end
