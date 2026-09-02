class AddArchivedToMailboxes < ActiveRecord::Migration[8.0]
  def change
    add_column :mailboxes, :archived, :boolean, null: false, default: false
    add_index :mailboxes, :archived
  end
end
