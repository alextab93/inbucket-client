ENV["RAILS_ENV"] ||= "test"
ENV["INBUCKET_BASE_URL"] = "http://inbucket.test:9000"

require File.expand_path("../config/environment", __dir__)
abort("Rails is running in production mode") if Rails.env.production?
require "spec_helper"
require "rspec/rails"
require "webmock/rspec"

begin
  ActiveRecord::Migration.maintain_test_schema!
rescue ActiveRecord::PendingMigrationError => e
  abort(e.to_s.strip)
end

RSpec.configure do |config|
  config.fixture_paths = [Rails.root.join("spec/fixtures")]
  config.use_transactional_fixtures = true
  config.infer_spec_type_from_file_location!
  config.filter_rails_from_backtrace!

  config.before do
    Rails.cache.clear
  end
end
