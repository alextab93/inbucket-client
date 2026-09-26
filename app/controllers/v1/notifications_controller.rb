module V1
  class NotificationsController < InbucketController
    def index
      render json: current_user.notification_deliveries.visible.limit(200).map(&:rendered)
    end

    def read
      current_user.notification_deliveries.find(params.require(:id)).mark_read!
      head :no_content
    end

    def clear
      current_user.notification_deliveries.find(params.require(:id)).clear!
      head :no_content
    end

    def browser_delivered
      delivery = current_user.notification_deliveries.find(params.require(:id))
      return head :unprocessable_content unless delivery.pending_browser?

      delivery.mark_delivered!
      head :no_content
    end

    def retry
      delivery = current_user.notification_deliveries.find(params.require(:id))
      return head :unprocessable_content unless delivery.retry!

      render json: delivery.rendered
    end
  end
end
