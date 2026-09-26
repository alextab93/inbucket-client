require "fileutils"
require "open3"
require "tempfile"

class RuleLuaScript
  class Unavailable < StandardError
  end

  class Invalid < Unavailable
  end

  TOKEN_PATTERN = /\A[a-zA-Z0-9]{32,}\z/
  EVENT_REVISION = "inbucket-event-v1".freeze

  class << self
    def revision
      EVENT_REVISION
    end

    def write!
      token = ENV.fetch("LUA_EVENT_TOKEN")
      raise Unavailable unless TOKEN_PATTERN.match?(token)

      path = ENV.fetch("LUA_SCRIPT_PATH")
      FileUtils.mkdir_p(File.dirname(path))
      rendered = source(revision:, token:)
      validate!(rendered)
      replace!(path, rendered) unless File.exist?(path) && File.read(path) == rendered
      state = RuleLuaState.order(:id).first_or_create!(desired_revision: revision)
      state.update!(desired_revision: revision, last_error_code: nil, last_failed_at: nil)
      rendered
    rescue Invalid
      record_failure!("invalid_generated_lua")
      raise
    rescue Unavailable
      record_failure!("lua_validation_unavailable")
      raise
    rescue KeyError, SystemCallError
      record_failure!("lua_storage_unavailable")
      raise Unavailable
    end

    def activate!(active_revision)
      state = RuleLuaState.order(:id).first_or_create!(desired_revision: revision)
      if active_revision == state.desired_revision
        state.update!(active_revision:, last_error_code: nil, last_failed_at: nil)
      end
      state
    end

    private

    def source(revision:, token:)
      <<~LUA
        local http = require("http")
        local json = require("json")

        local event_token = "#{token}"
        local event_revision = "#{revision}"

        function inbucket.after.message_stored(message)
          assert(http.post("http://127.0.0.1:3000/v1/internal/rule-events", {
            headers = {
              ["Content-Type"] = "application/json",
              ["X-Inbucket-Event-Token"] = event_token,
            },
            body = json.encode({
              mailbox = message.mailbox,
              id = message.id,
              revision = event_revision,
            }),
          }))
        end
      LUA
    end

    def validate!(rendered)
      Tempfile.create(["inbucket", ".lua"]) do |file|
        file.write(rendered)
        file.flush
        _output, status = Open3.capture2e(ENV.fetch("LUA_COMPILER", "luac"), "-p", file.path)
        raise Invalid unless status.success?
      end
    rescue Errno::ENOENT
      raise Unavailable
    end

    def replace!(path, rendered)
      temporary = "#{path}.tmp-#{Process.pid}"
      File.write(temporary, rendered)
      File.rename(temporary, path)
    end

    def record_failure!(code)
      state = RuleLuaState.order(:id).first_or_create!(desired_revision: revision)
      state.update!(last_error_code: code, last_failed_at: Time.current)
    end
  end
end
