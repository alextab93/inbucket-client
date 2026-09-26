class ExpandMessageRuleActions < ActiveRecord::Migration[8.0]
  def up
    rules_table = rules_table_name
    add_column rules_table, :last_triggered_at, :datetime unless column_exists?(rules_table, :last_triggered_at)
    change_column_default rules_table, :schema_version, from: 2, to: 4
    execute <<~SQL
      UPDATE #{quote_table_name(rules_table)}
      SET schema_version = 4,
          actions = '{"star":false,"mark_read":false,"tag_ids":[],"move_to_trash":false}'::jsonb || actions
    SQL
  end

  def down
    rules_table = rules_table_name
    execute <<~SQL
      UPDATE #{quote_table_name(rules_table)}
      SET schema_version = 2,
          actions = actions - 'star' - 'mark_read' - 'tag_ids' - 'move_to_trash'
    SQL
    change_column_default rules_table, :schema_version, from: 4, to: 2
    remove_column rules_table, :last_triggered_at if column_exists?(rules_table, :last_triggered_at)
  end

  private

  def rules_table_name
    return :message_rules if table_exists?(:message_rules)

    :notification_rules
  end
end
