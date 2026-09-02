require "rails_helper"

RSpec.describe "Email frame", type: :request do
  before { User.create!(username: "admin", password: "correct horse battery staple") }

  it "requires a private session" do
    get "/v1/email-frame"

    expect(response).to have_http_status(:unauthorized)
    expect(response.parsed_body).to eq("error" => "unauthorized")
  end

  it "serves an isolated frame that blocks remote content" do
    authenticate

    get "/v1/email-frame"

    expect(response).to have_http_status(:ok)
    expect(response.media_type).to eq("text/html")
    expect(response.body).to include("<body></body>")
    expect(response.headers["Content-Security-Policy"]).to include(
      "script-src 'none'",
      "form-action 'none'",
      "style-src 'unsafe-inline'",
      "img-src 'self' data:"
    )
    expect(response.headers["Content-Security-Policy"]).not_to include("img-src 'self' data: http: https:")
    expect(response.headers["Referrer-Policy"]).to eq("no-referrer")
  end

  it "allows remote images only for an explicit remote-image frame" do
    authenticate

    get "/v1/email-frame", params: { remote_images: true }

    expect(response).to have_http_status(:ok)
    expect(response.headers["Content-Security-Policy"]).to include("img-src 'self' data: http: https:")
  end

  def authenticate
    post "/v1/session",
         params: { username: "admin", password: "correct horse battery staple" }.to_json,
         headers: { "CONTENT_TYPE" => "application/json" }
    expect(response).to have_http_status(:ok)
  end
end
