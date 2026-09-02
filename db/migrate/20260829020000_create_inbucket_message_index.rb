class CreateInbucketMessageIndex < ActiveRecord::Migration[8.0]
  def up
    rename_table :monitor_messages, :inbucket_messages
    rename_column :inbucket_messages, :header, :metadata

    remove_index :inbucket_messages, column: %i[mailbox message_id]
    remove_index :inbucket_messages, column: :received_at

    add_column :inbucket_messages, :sender, :text
    add_column :inbucket_messages, :recipients, :jsonb, null: false, default: []
    add_column :inbucket_messages, :subject, :text
    add_column :inbucket_messages, :size, :bigint
    add_column :inbucket_messages, :seen, :boolean
    add_column :inbucket_messages, :available, :boolean, null: false, default: true
    add_column :inbucket_messages, :monitor_observed_at, :datetime
    add_column :inbucket_messages, :scan_observed_at, :datetime
    add_column :inbucket_messages, :direct_observed_at, :datetime
    add_column :inbucket_messages, :unavailable_at, :datetime

    execute <<~SQL
      UPDATE inbucket_messages
      SET sender = metadata->>'from',
          recipients = CASE
            WHEN jsonb_typeof(metadata->'to') = 'array' THEN metadata->'to'
            ELSE '[]'::jsonb
          END,
          subject = metadata->>'subject',
          size = CASE
            WHEN metadata->>'size' ~ '^[0-9]+$' THEN (metadata->>'size')::bigint
            ELSE NULL
          END,
          seen = CASE
            WHEN jsonb_typeof(metadata->'seen') = 'boolean' THEN (metadata->>'seen')::boolean
            ELSE NULL
          END,
          monitor_observed_at = created_at
    SQL

    execute <<~SQL
      INSERT INTO mailboxes (name, archived, created_at, updated_at)
      SELECT DISTINCT mailbox, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM inbucket_messages
      ON CONFLICT (name) DO NOTHING
    SQL

    add_index :inbucket_messages, %i[mailbox message_id], unique: true, name: "index_inbucket_messages_on_identity"
    add_index :inbucket_messages, %i[available received_at id], name: "index_inbucket_messages_on_available_and_received"
    add_index :inbucket_messages, %i[mailbox available received_at id], name: "index_inbucket_messages_on_mailbox_and_received"
    add_index :inbucket_messages, %i[mailbox available size id], name: "index_inbucket_messages_on_mailbox_and_size"
    add_index :inbucket_messages, %i[available seen received_at id], name: "index_inbucket_messages_on_available_seen_received"
    add_foreign_key :inbucket_messages, :mailboxes, column: :mailbox, primary_key: :name, on_delete: :cascade

    add_column :mailboxes, :sync_started_at, :datetime
    add_column :mailboxes, :synced_at, :datetime
    add_column :mailboxes, :sync_error, :string
  end

  def down
    remove_column :mailboxes, :sync_error
    remove_column :mailboxes, :synced_at
    remove_column :mailboxes, :sync_started_at

    remove_foreign_key :inbucket_messages, column: :mailbox
    remove_index :inbucket_messages, name: "index_inbucket_messages_on_available_seen_received"
    remove_index :inbucket_messages, name: "index_inbucket_messages_on_mailbox_and_size"
    remove_index :inbucket_messages, name: "index_inbucket_messages_on_mailbox_and_received"
    remove_index :inbucket_messages, name: "index_inbucket_messages_on_available_and_received"
    remove_index :inbucket_messages, name: "index_inbucket_messages_on_identity"

    remove_column :inbucket_messages, :unavailable_at
    remove_column :inbucket_messages, :direct_observed_at
    remove_column :inbucket_messages, :scan_observed_at
    remove_column :inbucket_messages, :monitor_observed_at
    remove_column :inbucket_messages, :available
    remove_column :inbucket_messages, :seen
    remove_column :inbucket_messages, :size
    remove_column :inbucket_messages, :subject
    remove_column :inbucket_messages, :recipients
    remove_column :inbucket_messages, :sender

    rename_column :inbucket_messages, :metadata, :header
    rename_table :inbucket_messages, :monitor_messages
    add_index :monitor_messages, %i[mailbox message_id], unique: true
    add_index :monitor_messages, :received_at
  end
end
