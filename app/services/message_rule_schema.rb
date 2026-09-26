class MessageRuleSchema
  class Invalid < StandardError
  end

  EMAIL_PATTERN = /\A[^@\s]+@[^@\s]+\.[^@\s]+\z/
  TIME_PATTERN = /\A(?:[01]\d|2[0-3]):[0-5]\d\z/
  CONDITION_KEYS = %w[mailboxes senders recipients subject minimum_size maximum_size has_attachments tag_ids time_windows].freeze
  ACTION_KEYS = %w[in_app browser destination_ids star mark_read tag_ids move_to_trash].freeze

  class << self
    def conditions(value)
      input = object(value, "conditions")
      reject_unknown!(input, CONDITION_KEYS, "conditions")
      result = {
        "mailboxes" => strings(input["mailboxes"], "mailboxes", 20),
        "senders" => strings(input["senders"], "senders", 20),
        "recipients" => strings(input["recipients"], "recipients", 20),
        "tag_ids" => positive_integers(input["tag_ids"], "tag_ids", 20),
        "time_windows" => time_windows(input["time_windows"])
      }
      subject = text(input["subject"], "subject", 160)
      result["subject"] = subject if subject
      minimum_size = nonnegative_integer(input["minimum_size"], "minimum_size")
      maximum_size = nonnegative_integer(input["maximum_size"], "maximum_size")
      raise Invalid, "minimum_size must not exceed maximum_size" if minimum_size && maximum_size && minimum_size > maximum_size

      result["minimum_size"] = minimum_size if minimum_size
      result["maximum_size"] = maximum_size if maximum_size
      unless input["has_attachments"].nil?
        raise Invalid, "has_attachments must be true or false" unless [true, false].include?(input["has_attachments"])

        result["has_attachments"] = input["has_attachments"]
      end
      result
    end

    def actions(value)
      input = object(value, "actions")
      reject_unknown!(input, ACTION_KEYS, "actions")
      in_app = boolean(input["in_app"], "in_app")
      browser = boolean(input["browser"], "browser")
      destination_ids = positive_integers(input["destination_ids"], "destination_ids", 20)
      star = boolean(input["star"], "star")
      mark_read = boolean(input["mark_read"], "mark_read")
      tag_ids = positive_integers(input["tag_ids"], "tag_ids", 20)
      move_to_trash = boolean(input["move_to_trash"], "move_to_trash")

      {
        "in_app" => in_app,
        "browser" => browser,
        "destination_ids" => destination_ids,
        "star" => star,
        "mark_read" => mark_read,
        "tag_ids" => tag_ids,
        "move_to_trash" => move_to_trash
      }
    end

    private

    def object(value, name)
      return {} if value.nil?
      return value.to_unsafe_h.deep_stringify_keys if value.respond_to?(:to_unsafe_h)
      return value.deep_stringify_keys if value.is_a?(Hash)

      raise Invalid, "#{name} must be an object"
    end

    def reject_unknown!(input, allowed, name)
      unknown = input.keys - allowed
      raise Invalid, "#{name} contains unsupported fields" if unknown.any?
    end

    def strings(value, name, maximum)
      return [] if value.nil?
      raise Invalid, "#{name} must be a list" unless value.is_a?(Array)
      raise Invalid, "#{name} has too many values" if value.length > maximum

      values = value.map do |entry|
        raise Invalid, "#{name} values must be text" unless entry.is_a?(String)

        normalized = entry.squish
        raise Invalid, "#{name} values must not be empty" if normalized.empty? || normalized.length > 160

        normalized.downcase
      end
      values.uniq.sort
    end

    def text(value, name, maximum)
      return nil if value.nil?
      raise Invalid, "#{name} must be text" unless value.is_a?(String)

      normalized = value.squish
      return nil if normalized.empty?

      raise Invalid, "#{name} is too long" if normalized.length > maximum

      normalized.downcase
    end

    def nonnegative_integer(value, name)
      return nil if value.nil?
      integer = Integer(value)
      raise Invalid, "#{name} must not be negative" if integer.negative?

      integer
    rescue ArgumentError, TypeError
      raise Invalid, "#{name} must be a whole number"
    end

    def positive_integers(value, name, maximum)
      return [] if value.nil?
      raise Invalid, "#{name} must be a list" unless value.is_a?(Array)
      raise Invalid, "#{name} has too many values" if value.length > maximum

      values = value.map { |entry| nonnegative_integer(entry, name) }
      raise Invalid, "#{name} values must be positive" if values.any?(&:zero?)

      values.uniq.sort
    end

    def nonnegative_integers(value, name, maximum)
      return [] if value.nil?
      raise Invalid, "#{name} must be a list" unless value.is_a?(Array)
      raise Invalid, "#{name} has too many values" if value.length > maximum

      value.map { |entry| nonnegative_integer(entry, name) }.uniq.sort
    end

    def boolean(value, name)
      return false if value.nil?
      return value if [true, false].include?(value)

      raise Invalid, "#{name} must be true or false"
    end

    def time_windows(value)
      return [] if value.nil?
      raise Invalid, "time_windows must be a list" unless value.is_a?(Array)
      raise Invalid, "time_windows has too many values" if value.length > 8

      value.map do |entry|
        window = object(entry, "time window")
        reject_unknown!(window, %w[days start finish], "time window")
        days = nonnegative_integers(window["days"], "time window days", 7)
        raise Invalid, "time window days must be between 0 and 6" unless days.all? { |day| day.between?(0, 6) }
        raise Invalid, "time window days must not be empty" if days.empty?

        start = window["start"]
        finish = window["finish"]
        raise Invalid, "time window start is invalid" unless start.is_a?(String) && TIME_PATTERN.match?(start)
        raise Invalid, "time window finish is invalid" unless finish.is_a?(String) && TIME_PATTERN.match?(finish)

        { "days" => days, "start" => start, "finish" => finish }
      end.sort_by { |window| [window.fetch("days"), window.fetch("start"), window.fetch("finish")] }
    end
  end
end
