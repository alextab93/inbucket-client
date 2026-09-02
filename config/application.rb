require_relative "boot"

require "rails"
require "active_model/railtie"
require "active_record/railtie"
require "action_controller/railtie"
require_relative "../lib/static_cache_headers"

Bundler.require(*Rails.groups)

module InbucketCliStartos
  class Application < Rails::Application
    config.load_defaults 8.0
    config.api_only = true
    config.autoload_lib(ignore: %w[assets tasks])
    config.middleware.use ActionDispatch::Cookies
    config.middleware.insert_before 0, StaticCacheHeaders
    config.public_file_server.enabled = true
  end
end
