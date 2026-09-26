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

ActiveRecord::Schema[8.0].define(version: 2026_09_27_010000) do
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

  create_table "message_rules", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "name", null: false
    t.boolean "enabled", default: true, null: false
    t.integer "priority", default: 0, null: false
    t.integer "cooldown_seconds", default: 300, null: false
    t.integer "schema_version", default: 4, null: false
    t.jsonb "conditions", default: {}, null: false
    t.jsonb "actions", default: {}, null: false
    t.string "last_error_code"
    t.datetime "last_failed_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.datetime "last_triggered_at"
    t.index "user_id, lower((name)::text)", name: "index_message_rules_on_user_and_lower_name", unique: true
    t.index ["user_id"], name: "index_message_rules_on_user_id"
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

  create_table "notification_deliveries", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.bigint "message_rule_id"
    t.bigint "inbucket_message_id"
    t.string "mailbox", null: false
    t.string "message_id", null: false
    t.string "kind", null: false
    t.string "status", null: false
    t.string "recipient"
    t.string "deduplication_key", null: false
    t.integer "attempt_count", default: 0, null: false
    t.datetime "next_attempt_at"
    t.datetime "locked_at"
    t.datetime "delivered_at"
    t.datetime "failed_at"
    t.datetime "read_at"
    t.datetime "cleared_at"
    t.string "error_code"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "notification_destination_id"
    t.datetime "last_attempt_at"
    t.index ["deduplication_key"], name: "index_notification_deliveries_on_deduplication_key", unique: true
    t.index ["inbucket_message_id"], name: "index_notification_deliveries_on_inbucket_message_id"
    t.index ["kind", "last_attempt_at"], name: "index_notification_deliveries_for_rate_limit"
    t.index ["kind", "status", "next_attempt_at"], name: "index_notification_deliveries_for_delivery"
    t.index ["message_rule_id"], name: "index_notification_deliveries_on_message_rule_id"
    t.index ["notification_destination_id"], name: "index_notification_deliveries_on_notification_destination_id"
    t.index ["user_id", "cleared_at", "created_at"], name: "index_notification_deliveries_for_center"
    t.index ["user_id"], name: "index_notification_deliveries_on_user_id"
  end

  create_table "notification_destinations", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "name", null: false
    t.jsonb "methods", default: [], null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index "user_id, lower((name)::text)", name: "index_notification_destinations_on_user_and_lower_name", unique: true
    t.index ["user_id"], name: "index_notification_destinations_on_user_id"
  end

  create_table "rule_lua_states", force: :cascade do |t|
    t.string "desired_revision", null: false
    t.string "active_revision"
    t.string "last_error_code"
    t.datetime "last_failed_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
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
  add_foreign_key "message_rules", "users"
  add_foreign_key "message_tags", "inbucket_messages", on_delete: :cascade
  add_foreign_key "message_tags", "tags", on_delete: :cascade
  add_foreign_key "notification_deliveries", "inbucket_messages", on_delete: :nullify
  add_foreign_key "notification_deliveries", "message_rules", on_delete: :nullify
  add_foreign_key "notification_deliveries", "notification_destinations", on_delete: :nullify
  add_foreign_key "notification_deliveries", "users"
  add_foreign_key "notification_destinations", "users"
  add_foreign_key "starred_messages", "inbucket_messages", on_delete: :cascade
  add_foreign_key "starred_messages", "users"
  add_foreign_key "tags", "users"
  add_foreign_key "trashed_messages", "inbucket_messages", on_delete: :cascade
  add_foreign_key "trashed_messages", "users"
  add_foreign_key "user_sessions", "users"
end
