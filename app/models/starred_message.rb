class StarredMessage < ApplicationRecord
  belongs_to :inbucket_message
  belongs_to :user

  validates :inbucket_message_id, uniqueness: { scope: :user_id }

  def self.lookup(user:, messages:)
    keys = identity_keys(messages)
    return {} if keys.empty?

    records = matching_records(user, keys)
    records.index_by { |starred| [starred.inbucket_message.mailbox, starred.inbucket_message.message_id] }
  end

  def self.identity_keys(messages)
    messages.grep(Hash).map { |message| [message["mailbox"].to_s, message["id"].to_s] }
  end

  def self.matching_records(user, keys)
    identities = {
      mailbox: keys.map(&:first).uniq,
      message_id: keys.map(&:last).uniq,
      available: true
    }
    includes(:inbucket_message).joins(:inbucket_message).where(user:, inbucket_messages: identities)
  end

  private_class_method :identity_keys, :matching_records

  def rendered_summary
    tags = Tag.lookup(user:, messages: [inbucket_message.rendered_summary])
    key = [inbucket_message.mailbox, inbucket_message.message_id]
    inbucket_message.rendered_summary(starred: true, tags: tags.fetch(key, []))
  end
end
