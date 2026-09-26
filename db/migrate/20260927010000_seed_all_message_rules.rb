class SeedAllMessageRules < ActiveRecord::Migration[8.0]
  def up
    User.find_each do |user|
      next if user.message_rules.exists?(["lower(name) = ?", "all"])

      user.message_rules.create!(AdminAccount.all_message_rule_attributes)
    end
  end

  def down
    raise ActiveRecord::IrreversibleMigration
  end
end
