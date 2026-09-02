class Mailbox < ApplicationRecord
  has_many :inbucket_messages, primary_key: :name, foreign_key: :mailbox, dependent: :delete_all, inverse_of: false

  normalizes :name, with: ->(name) { name.strip }

  validates :name, presence: true, length: { maximum: 255 }, uniqueness: true

  scope :active, -> { where(archived: false) }
  scope :archived, -> { where(archived: true) }

  def self.record(name)
    normalized_name = name.to_s.strip
    return if normalized_name.empty?

    find_or_create_by!(name: normalized_name)
  end
end
