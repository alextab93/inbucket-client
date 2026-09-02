class AddInbucketMessagePaginationIndex < ActiveRecord::Migration[8.0]
  def change
    add_index :inbucket_messages, %i[available size id], name: "index_inbucket_messages_on_available_and_size"
  end
end
