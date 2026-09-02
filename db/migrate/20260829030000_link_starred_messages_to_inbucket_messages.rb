class LinkStarredMessagesToInbucketMessages < ActiveRecord::Migration[8.0]
  def up
    add_reference :starred_messages, :inbucket_message, foreign_key: { on_delete: :cascade }

    execute <<~SQL
      INSERT INTO mailboxes (name, archived, created_at, updated_at)
      SELECT DISTINCT mailbox, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM starred_messages
      ON CONFLICT (name) DO NOTHING
    SQL

    execute <<~SQL
      INSERT INTO inbucket_messages (
        mailbox,
        message_id,
        metadata,
        received_at,
        sender,
        recipients,
        subject,
        size,
        seen,
        available,
        scan_observed_at,
        created_at,
        updated_at
      )
      SELECT DISTINCT ON (mailbox, message_id)
        mailbox,
        message_id,
        summary - 'starred',
        NULL,
        summary->>'from',
        CASE
          WHEN jsonb_typeof(summary->'to') = 'array' THEN summary->'to'
          ELSE '[]'::jsonb
        END,
        summary->>'subject',
        CASE
          WHEN summary->>'size' ~ '^[0-9]+$' THEN (summary->>'size')::bigint
          ELSE NULL
        END,
        CASE
          WHEN jsonb_typeof(summary->'seen') = 'boolean' THEN (summary->>'seen')::boolean
          ELSE NULL
        END,
        TRUE,
        updated_at,
        created_at,
        updated_at
      FROM starred_messages
      ORDER BY mailbox, message_id, updated_at DESC
      ON CONFLICT (mailbox, message_id) DO UPDATE
      SET metadata = EXCLUDED.metadata,
          sender = EXCLUDED.sender,
          recipients = EXCLUDED.recipients,
          subject = EXCLUDED.subject,
          size = EXCLUDED.size,
          seen = EXCLUDED.seen,
          available = TRUE,
          unavailable_at = NULL,
          scan_observed_at = EXCLUDED.scan_observed_at,
          updated_at = EXCLUDED.updated_at
    SQL

    execute <<~SQL
      UPDATE starred_messages
      SET inbucket_message_id = inbucket_messages.id
      FROM inbucket_messages
      WHERE starred_messages.mailbox = inbucket_messages.mailbox
        AND starred_messages.message_id = inbucket_messages.message_id
    SQL

    change_column_null :starred_messages, :inbucket_message_id, false
    remove_index :starred_messages, %i[user_id mailbox message_id]
    add_index :starred_messages, %i[user_id inbucket_message_id], unique: true, name: "index_starred_messages_on_user_and_message"
    remove_column :starred_messages, :summary
    remove_column :starred_messages, :message_id
    remove_column :starred_messages, :mailbox
  end

  def down
    add_column :starred_messages, :mailbox, :string
    add_column :starred_messages, :message_id, :string
    add_column :starred_messages, :summary, :jsonb, null: false, default: {}

    execute <<~SQL
      UPDATE starred_messages
      SET mailbox = inbucket_messages.mailbox,
          message_id = inbucket_messages.message_id,
          summary = inbucket_messages.metadata
      FROM inbucket_messages
      WHERE starred_messages.inbucket_message_id = inbucket_messages.id
    SQL

    change_column_null :starred_messages, :mailbox, false
    change_column_null :starred_messages, :message_id, false
    remove_index :starred_messages, name: "index_starred_messages_on_user_and_message"
    add_index :starred_messages, %i[user_id mailbox message_id], unique: true
    remove_reference :starred_messages, :inbucket_message, foreign_key: true
  end
end
