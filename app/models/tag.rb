class Tag < ApplicationRecord
  PRESET_COLORS = {
    "Blue" => "#1D4ED8",
    "Indigo" => "#4338CA",
    "Violet" => "#6D28D9",
    "Magenta" => "#A21CAF",
    "Rose" => "#BE123C",
    "Red" => "#B91C1C",
    "Orange" => "#C2410C",
    "Amber" => "#A16207",
    "Green" => "#15803D",
    "Teal" => "#0F766E"
  }.freeze
  COLOR_PATTERN = /\A#[0-9A-F]{6}\z/

  belongs_to :user
  has_many :message_tags, dependent: :destroy
  has_many :inbucket_messages, through: :message_tags

  normalizes :name, with: ->(name) { name.to_s.squish }

  validates :name, presence: true, length: { maximum: 40 }, uniqueness: { scope: :user_id, case_sensitive: false }
  validates :color, presence: true, format: { with: COLOR_PATTERN }

  scope :ordered, -> { order(Arel.sql("lower(name) ASC"), :id) }

  def self.lookup(user:, messages:)
    keys = identity_keys(messages)
    return {} if keys.empty?

    records = matching_records(user, keys)
    records.group_by { |tag| [tag.tagged_mailbox, tag.tagged_message_id] }
           .transform_values { |tags| tags.sort_by { |tag| [tag.name.downcase, tag.id] }.map(&:rendered) }
  end

  def rendered
    { id:, name:, color: }
  end

  def self.identity_keys(messages)
    messages.grep(Hash).map do |message|
      [message["mailbox"].to_s, message["id"].to_s]
    end.uniq
  end

  def self.matching_records(user, keys)
    joins(message_tags: :inbucket_message)
      .where(
        user:,
        inbucket_messages: {
          mailbox: keys.map(&:first).uniq,
          message_id: keys.map(&:last).uniq
        }
      )
      .select(
        "tags.*, inbucket_messages.mailbox AS tagged_mailbox, " \
        "inbucket_messages.message_id AS tagged_message_id"
      )
  end

  private_class_method :identity_keys, :matching_records
end
