class CreateMonitorMessages < ActiveRecord::Migration[8.0]
  def change
    create_table :monitor_messages do |t|
      t.string :mailbox, null: false
      t.string :message_id, null: false
      t.jsonb :header, null: false, default: {}
      t.datetime :received_at
      t.timestamps
    end

    add_index :monitor_messages, %i[mailbox message_id], unique: true
    add_index :monitor_messages, :received_at
  end
end
