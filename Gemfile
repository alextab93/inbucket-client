source "https://rubygems.org"

ruby ">= 3.3.0", "< 3.5"

gem "bcrypt", "~> 3.1"
gem "eventmachine", "~> 1.2"
gem "faye-websocket", "~> 0.11"
gem "actionpack", "~> 8.0.2"
gem "activerecord", "~> 8.0.2"
gem "mail", "~> 2.9"
gem "pg", "~> 1.5"
gem "puma", ">= 5.0"
gem "railties", "~> 8.0.2"

group :development, :test do
  gem "debug", platforms: %i[mri windows], require: "debug/prelude"
  gem "rubocop", require: false
  gem "rubocop-performance", require: false
  gem "rubocop-rails", require: false
  gem "rubocop-rspec", require: false
end

group :test do
  gem "rspec-rails", "~> 8.0"
  gem "webmock", "~> 3.25"
end
