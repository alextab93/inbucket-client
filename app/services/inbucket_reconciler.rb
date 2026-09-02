require "fileutils"

class InbucketReconciler
  INTERVAL = 24.hours
  RETRY_DELAY = 5.minutes
  READY_PATH = "/tmp/inbucket-reconciler-ready".freeze

  def initialize(sync: InbucketMailboxSync.new, sleeper: Kernel)
    @sync = sync
    @sleeper = sleeper
  end

  def run
    FileUtils.rm_f(READY_PATH)
    loop do
      failures = run_once
      File.write(READY_PATH, "ready")
      @sleeper.sleep(failures.zero? ? INTERVAL : RETRY_DELAY)
    end
  ensure
    FileUtils.rm_f(READY_PATH)
  end

  def run_once
    failures = 0
    Mailbox.order(:id).find_each do |mailbox|
      result = @sync.call(mailbox.name)
      failures += 1 unless result.response.status.between?(200, 299)
    rescue InbucketClient::Unavailable, InbucketClient::InvalidResponse => e
      Rails.logger.error("Inbucket reconciliation failed for #{mailbox.name}: #{e.class.name}")
      failures += 1
    end
    failures
  end
end
