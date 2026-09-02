module V1
  class SessionsController < ApplicationController
    before_action :require_session!, only: :show

    def show
      render json: {
        authenticated: true,
        username: current_user_session.user.username,
        expires_at: current_user_session.expires_at.iso8601
      }
    end

    def create
      user = authenticated_user
      unless user
        clear_session_cookie
        render json: { error: "invalid_credentials" }, status: :unauthorized
        return
      end

      session, raw_token = UserSession.issue!(user)
      revoke_other_sessions(user, session)
      set_session_cookie(raw_token, session.expires_at)
      render json: session_payload(user, session)
    end

    def destroy
      current_user_session&.revoke!
      clear_session_cookie
      head :no_content
    end

    private

    def normalized_username
      params[:username].to_s.strip.downcase
    end

    def authenticated_user
      user = User.find_by(username: normalized_username)
      user if user&.authenticate(params[:password].to_s)
    end

    def revoke_other_sessions(user, current_session)
      user.user_sessions.where.not(id: current_session.id).where(revoked_at: nil).find_each(&:revoke!)
    end

    def session_payload(user, session)
      { authenticated: true, username: user.username, expires_at: session.expires_at.iso8601 }
    end
  end
end
