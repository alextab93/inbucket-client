class CreateTags < ActiveRecord::Migration[8.0]
  def change
    create_table :tags do |t|
      t.references :user, null: false, foreign_key: true
      t.string :name, null: false
      t.string :color, null: false
      t.timestamps
    end

    add_index :tags, "user_id, lower(name)", unique: true, name: "index_tags_on_user_and_lower_name"

    create_table :message_tags do |t|
      t.references :tag, null: false, foreign_key: { on_delete: :cascade }
      t.references :inbucket_message, null: false, foreign_key: { on_delete: :cascade }
      t.timestamps
    end

    add_index :message_tags, %i[tag_id inbucket_message_id], unique: true
  end
end
