# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.0].define(version: 2026_08_30_010000) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "inbucket_messages", force: :cascade do |t|
    t.string "mailbox", null: false
    t.string "message_id", null: false
    t.jsonb "metadata", default: {}, null: false
    t.datetime "received_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.text "sender"
    t.jsonb "recipients", default: [], null: false
    t.text "subject"
    t.bigint "size"
    t.boolean "seen"
    t.boolean "available", default: true, null: false
    t.datetime "monitor_observed_at"
    t.datetime "scan_observed_at"
    t.datetime "direct_observed_at"
    t.datetime "unavailable_at"
    t.index ["available", "received_at", "id"], name: "index_inbucket_messages_on_available_and_received"
    t.index ["available", "seen", "received_at", "id"], name: "index_inbucket_messages_on_available_seen_received"
    t.index ["available", "size", "id"], name: "index_inbucket_messages_on_available_and_size"
    t.index ["mailbox", "available", "received_at", "id"], name: "index_inbucket_messages_on_mailbox_and_received"
    t.index ["mailbox", "available", "size", "id"], name: "index_inbucket_messages_on_mailbox_and_size"
    t.index ["mailbox", "message_id"], name: "index_inbucket_messages_on_identity", unique: true
  end

  create_table "mailboxes", force: :cascade do |t|
    t.string "name", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "archived", default: false, null: false
    t.datetime "sync_started_at"
    t.datetime "synced_at"
    t.string "sync_error"
    t.index ["archived"], name: "index_mailboxes_on_archived"
    t.index ["name"], name: "index_mailboxes_on_name", unique: true
  end

  create_table "message_tags", force: :cascade do |t|
    t.bigint "tag_id", null: false
    t.bigint "inbucket_message_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["inbucket_message_id"], name: "index_message_tags_on_inbucket_message_id"
    t.index ["tag_id", "inbucket_message_id"], name: "index_message_tags_on_tag_id_and_inbucket_message_id", unique: true
    t.index ["tag_id"], name: "index_message_tags_on_tag_id"
  end

  create_table "starred_messages", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "inbucket_message_id", null: false
    t.index ["inbucket_message_id"], name: "index_starred_messages_on_inbucket_message_id"
    t.index ["user_id", "inbucket_message_id"], name: "index_starred_messages_on_user_and_message", unique: true
    t.index ["user_id"], name: "index_starred_messages_on_user_id"
  end

  create_table "tags", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "name", null: false
    t.string "color", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index "user_id, lower((name)::text)", name: "index_tags_on_user_and_lower_name", unique: true
    t.index ["user_id"], name: "index_tags_on_user_id"
  end

  create_table "trashed_messages", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.bigint "inbucket_message_id", null: false
    t.datetime "trashed_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["inbucket_message_id"], name: "index_trashed_messages_on_inbucket_message_id"
    t.index ["user_id", "inbucket_message_id"], name: "index_trashed_messages_on_user_id_and_inbucket_message_id", unique: true
    t.index ["user_id", "trashed_at", "id"], name: "index_trashed_messages_on_user_id_and_trashed_at_and_id"
    t.index ["user_id"], name: "index_trashed_messages_on_user_id"
  end

  create_table "user_sessions", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "token_digest", null: false
    t.datetime "expires_at", null: false
    t.datetime "revoked_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["expires_at"], name: "index_user_sessions_on_expires_at"
    t.index ["token_digest"], name: "index_user_sessions_on_token_digest", unique: true
    t.index ["user_id"], name: "index_user_sessions_on_user_id"
  end

  create_table "users", force: :cascade do |t|
    t.string "username", null: false
    t.string "password_digest", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index "lower((username)::text)", name: "index_users_on_lower_username", unique: true
  end

  add_foreign_key "inbucket_messages", "mailboxes", column: "mailbox", primary_key: "name", on_delete: :cascade
  add_foreign_key "message_tags", "inbucket_messages", on_delete: :cascade
  add_foreign_key "message_tags", "tags", on_delete: :cascade
  add_foreign_key "starred_messages", "inbucket_messages", on_delete: :cascade
  add_foreign_key "starred_messages", "users"
  add_foreign_key "tags", "users"
  add_foreign_key "trashed_messages", "inbucket_messages", on_delete: :cascade
  add_foreign_key "trashed_messages", "users"
  add_foreign_key "user_sessions", "users"
end
