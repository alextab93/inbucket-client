class CreateTrashedMessages < ActiveRecord::Migration[8.0]
  def change
    create_table :trashed_messages do |table|
      table.references :user, null: false, foreign_key: true
      table.references :inbucket_message, null: false, foreign_key: { on_delete: :cascade }
      table.datetime :trashed_at, null: false
      table.timestamps
    end

    add_index :trashed_messages, %i[user_id inbucket_message_id], unique: true
    add_index :trashed_messages, %i[user_id trashed_at id]
  end
end
