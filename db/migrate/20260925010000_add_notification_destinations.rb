class AddNotificationDestinations < ActiveRecord::Migration[8.0]
  def up
    unless table_exists?(:notification_destinations)
      create_table :notification_destinations do |t|
        t.references :user, null: false, foreign_key: true
        t.string :name, null: false
        t.jsonb :methods, null: false, default: []
        t.timestamps
      end

      add_index :notification_destinations, "user_id, lower((name)::text)", unique: true, name: "index_notification_destinations_on_user_and_lower_name"
    end

    unless column_exists?(:notification_deliveries, :notification_destination_id)
      add_reference :notification_deliveries, :notification_destination, null: true, foreign_key: { on_delete: :nullify }
    end
  end

  def down
    remove_reference :notification_deliveries, :notification_destination, foreign_key: true if column_exists?(:notification_deliveries, :notification_destination_id)
    drop_table :notification_destinations if table_exists?(:notification_destinations)
  end
end
