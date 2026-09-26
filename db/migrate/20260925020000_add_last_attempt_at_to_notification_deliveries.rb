class AddLastAttemptAtToNotificationDeliveries < ActiveRecord::Migration[8.0]
  def up
    add_column :notification_deliveries, :last_attempt_at, :datetime unless column_exists?(:notification_deliveries, :last_attempt_at)
    add_index :notification_deliveries, [:kind, :last_attempt_at], name: "index_notification_deliveries_for_rate_limit" unless index_exists?(:notification_deliveries, [:kind, :last_attempt_at], name: "index_notification_deliveries_for_rate_limit")
  end

  def down
    remove_index :notification_deliveries, name: "index_notification_deliveries_for_rate_limit" if index_exists?(:notification_deliveries, [:kind, :last_attempt_at], name: "index_notification_deliveries_for_rate_limit")
    remove_column :notification_deliveries, :last_attempt_at if column_exists?(:notification_deliveries, :last_attempt_at)
  end
end
