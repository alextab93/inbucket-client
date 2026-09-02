class HealthController < ActionController::API
  def show
    ActiveRecord::Base.connection.select_value("SELECT 1")
    head :ok
  rescue ActiveRecord::ActiveRecordError
    head :service_unavailable
  end
end
