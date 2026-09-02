class MessageTag < ApplicationRecord
  belongs_to :tag
  belongs_to :inbucket_message

  validates :inbucket_message_id, uniqueness: { scope: :tag_id }
end
