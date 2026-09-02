require "active_support/core_ext/integer/time"

Rails.application.configure do
  config.enable_reloading = false
  config.eager_load = true
  config.consider_all_requests_local = false
  config.public_file_server.enabled = true
  config.log_level = ENV.fetch("RAILS_LOG_LEVEL", "info")
  config.log_tags = [:request_id]
  config.logger = ActiveSupport::TaggedLogging.logger($stdout)
  config.active_support.report_deprecations = false
  config.cache_store = :memory_store, { size: 16 * 1024 * 1024 }
  config.assume_ssl = true
  config.force_ssl = false
  config.hosts.clear
end
