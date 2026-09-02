class User < ApplicationRecord
  has_secure_password

  has_many :starred_messages, dependent: :destroy
  has_many :starred_inbucket_messages, through: :starred_messages, source: :inbucket_message
  has_many :trashed_messages, dependent: :destroy
  has_many :tags, dependent: :destroy
  has_many :user_sessions, dependent: :destroy

  normalizes :username, with: ->(username) { username.strip.downcase }

  validates :username, presence: true, uniqueness: { case_sensitive: false }
  validates :password, length: { minimum: 12 }, allow_nil: true
end
