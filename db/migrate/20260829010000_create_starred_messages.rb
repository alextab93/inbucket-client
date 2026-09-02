class CreateStarredMessages < ActiveRecord::Migration[8.0]
  def change
    create_table :starred_messages do |t|
      t.references :user, null: false, foreign_key: true
      t.string :mailbox, null: false
      t.string :message_id, null: false
      t.jsonb :summary, null: false, default: {}
      t.timestamps
    end

    add_index :starred_messages, %i[user_id mailbox message_id], unique: true
  end
end
