class ApplicationController < ActionController::API
  include ActionController::Cookies

  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found
  rescue_from ActionController::ParameterMissing, with: :render_invalid_request

  before_action :set_private_cache_headers
  before_action :validate_browser_origin, if: :state_changing_request?

  private

  def current_user_session
    return @current_user_session if defined?(@current_user_session)

    raw_token = cookies.encrypted[:inbucket_session]
    @current_user_session = UserSession.authenticate(raw_token)
  end

  def current_user
    current_user_session&.user
  end

  def require_session!
    return if current_user_session

    clear_session_cookie
    render json: { error: "unauthorized" }, status: :unauthorized
  end

  def set_session_cookie(raw_token, expires_at)
    cookies.encrypted[:inbucket_session] = {
      value: raw_token,
      expires: expires_at,
      httponly: true,
      secure: Rails.env.production?,
      same_site: :lax,
      path: "/"
    }
  end

  def clear_session_cookie
    cookies.delete(:inbucket_session, secure: Rails.env.production?, same_site: :lax, path: "/")
  end

  def validate_browser_origin
    origin = request.headers["Origin"]
    return if origin.blank? || origin == request.base_url

    render json: { error: "origin_not_allowed" }, status: :forbidden
  end

  def state_changing_request?
    !request.get? && !request.head? && !request.options?
  end

  def set_private_cache_headers
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["Pragma"] = "no-cache"
  end

  def render_not_found
    render json: { error: "not_found" }, status: :not_found
  end

  def render_invalid_request
    render json: { error: "invalid_request" }, status: :unprocessable_content
  end
end
