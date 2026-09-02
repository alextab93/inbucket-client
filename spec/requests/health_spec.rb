require "rails_helper"

RSpec.describe "Health", type: :request do
  it "reports success when the database is available" do
    get "/up"

    expect(response).to have_http_status(:ok)
  end
end
