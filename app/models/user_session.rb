class UserSession < ApplicationRecord
  TOKEN_BYTES = 32
  LIFETIME = 12.hours

  belongs_to :user

  validates :token_digest, presence: true, uniqueness: true
  validates :expires_at, presence: true

  def self.issue!(user)
    raw_token = SecureRandom.urlsafe_base64(TOKEN_BYTES, false)
    session = create!(user:, token_digest: digest(raw_token), expires_at: LIFETIME.from_now)
    [session, raw_token]
  end

  def self.authenticate(raw_token)
    return unless raw_token.is_a?(String) && raw_token.present?

    session = includes(:user).find_by(token_digest: digest(raw_token))
    session if session&.active?
  end

  def self.digest(raw_token)
    OpenSSL::Digest::SHA256.hexdigest(raw_token)
  end

  def active?
    revoked_at.nil? && expires_at.future?
  end

  def revoke!
    update!(revoked_at: Time.current) unless revoked_at
  end
end
