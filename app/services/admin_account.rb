class AdminAccount
  def self.sync!(username:, password:)
    user = User.find_or_initialize_by(username:)
    password_changed = !user.persisted? || !user.authenticate(password)
    user.password = password
    user.password_confirmation = password
    user.save!
    user.user_sessions.where(revoked_at: nil).update_all(revoked_at: Time.current) if password_changed
    user
  end
end
