require "rails_helper"

RSpec.describe "Session flow", type: :request do
  before { User.create!(username: "Admin", password: "correct horse battery staple") }

  it "signs in with valid credentials and restores the session" do
    post "/v1/session",
         params: { username: " admin ", password: "correct horse battery staple" }.to_json,
         headers: json_headers

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).to include("authenticated" => true, "username" => "admin")
    expect(response.headers["Cache-Control"]).to eq("private, no-store")
    expect(response.headers["Pragma"]).to eq("no-cache")

    get "/v1/session"

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).to include("authenticated" => true, "username" => "admin")
  end

  it "rejects invalid credentials without creating an authenticated session" do
    post "/v1/session", params: { username: "admin", password: "incorrect password" }.to_json, headers: json_headers

    expect(response).to have_http_status(:unauthorized)
    expect(response.parsed_body).to eq("error" => "invalid_credentials")

    get "/v1/session"

    expect(response).to have_http_status(:unauthorized)
  end

  it "signs out and invalidates the session" do
    post "/v1/session",
         params: { username: "admin", password: "correct horse battery staple" }.to_json,
         headers: json_headers

    delete "/v1/session"

    expect(response).to have_http_status(:no_content)

    get "/v1/session"

    expect(response).to have_http_status(:unauthorized)
  end

  def json_headers
    { "CONTENT_TYPE" => "application/json" }
  end
end
