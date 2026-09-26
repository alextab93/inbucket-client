class CreateMessageRules < ActiveRecord::Migration[8.0]
  def change
    create_table :message_rules do |t|
      t.references :user, null: false, foreign_key: true
      t.string :name, null: false
      t.boolean :enabled, null: false, default: true
      t.integer :priority, null: false, default: 0
      t.integer :cooldown_seconds, null: false, default: 300
      t.integer :schema_version, null: false, default: 2
      t.jsonb :conditions, null: false, default: {}
      t.jsonb :actions, null: false, default: {}
      t.string :last_error_code
      t.datetime :last_failed_at
      t.timestamps
    end

    add_index :message_rules, "user_id, lower((name)::text)", unique: true, name: "index_message_rules_on_user_and_lower_name"

    create_table :rule_lua_states do |t|
      t.string :desired_revision, null: false
      t.string :active_revision
      t.string :last_error_code
      t.datetime :last_failed_at
      t.timestamps
    end

    create_table :notification_deliveries do |t|
      t.references :user, null: false, foreign_key: true
      t.references :message_rule, null: true, foreign_key: { on_delete: :nullify }
      t.references :inbucket_message, null: true, foreign_key: { on_delete: :nullify }
      t.string :mailbox, null: false
      t.string :message_id, null: false
      t.string :kind, null: false
      t.string :status, null: false
      t.string :recipient
      t.string :deduplication_key, null: false
      t.integer :attempt_count, null: false, default: 0
      t.datetime :next_attempt_at
      t.datetime :locked_at
      t.datetime :delivered_at
      t.datetime :failed_at
      t.datetime :read_at
      t.datetime :cleared_at
      t.string :error_code
      t.timestamps
    end

    add_index :notification_deliveries, :deduplication_key, unique: true
    add_index :notification_deliveries, [:kind, :status, :next_attempt_at], name: "index_notification_deliveries_for_delivery"
    add_index :notification_deliveries, [:user_id, :cleared_at, :created_at], name: "index_notification_deliveries_for_center"
  end
end
