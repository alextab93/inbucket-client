class TrashedMessage < ApplicationRecord
  belongs_to :inbucket_message
  belongs_to :user

  validates :inbucket_message_id, uniqueness: { scope: :user_id }

  scope :ordered, -> { order(trashed_at: :desc, id: :desc) }

  def self.rendered_summaries(user:, records:)
    summaries = records.map { |trash| trash.inbucket_message.rendered_summary }
    starred = StarredMessage.lookup(user:, messages: summaries)
    tags = Tag.lookup(user:, messages: summaries)
    records.map do |trash|
      message = trash.inbucket_message
      key = [message.mailbox, message.message_id]
      message.rendered_summary(starred: starred.key?(key), tags: tags.fetch(key, [])).merge(
        "available" => message.available?,
        "trashed_at" => trash.trashed_at.iso8601(6)
      )
    end
  end

  def rendered_summary
    self.class.rendered_summaries(user:, records: [self]).first
  end
end
