class RenameNotificationRulesToMessageRules < ActiveRecord::Migration[8.0]
  def up
    rename_table :notification_rules, :message_rules if table_exists?(:notification_rules) && !table_exists?(:message_rules)
    rename_table :notification_lua_states, :rule_lua_states if table_exists?(:notification_lua_states) && !table_exists?(:rule_lua_states)
    if table_exists?(:notification_deliveries) &&
        column_exists?(:notification_deliveries, :notification_rule_id) &&
        !column_exists?(:notification_deliveries, :message_rule_id)
      rename_column :notification_deliveries, :notification_rule_id, :message_rule_id
    end
  end

  def down
    if table_exists?(:notification_deliveries) &&
        column_exists?(:notification_deliveries, :message_rule_id) &&
        !column_exists?(:notification_deliveries, :notification_rule_id)
      rename_column :notification_deliveries, :message_rule_id, :notification_rule_id
    end
    rename_table :rule_lua_states, :notification_lua_states if table_exists?(:rule_lua_states) && !table_exists?(:notification_lua_states)
    rename_table :message_rules, :notification_rules if table_exists?(:message_rules) && !table_exists?(:notification_rules)
  end
end
