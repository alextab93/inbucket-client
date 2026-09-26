class NotificationDestination < ApplicationRecord
  belongs_to :user
  has_many :notification_deliveries, dependent: :nullify

  normalizes :name, with: ->(name) { name.to_s.squish }

  validates :name, presence: true, length: { maximum: 80 }, uniqueness: { scope: :user_id, case_sensitive: false }
  validate :methods_are_valid

  before_validation :normalize_methods
  before_destroy :remove_from_rules

  scope :ordered, -> { order(name: :asc, id: :asc) }

  def delivery_method(kind)
    methods.find { |method| method["kind"] == kind }
  end

  def kinds
    methods.map { |method| method.fetch("kind") }
  end

  def delivery_label(kind)
    "#{name} (#{kind})"
  end

  def rendered
    { id:, name:, methods: methods.map { |method| method.except("token") } }
  end

  private

  def normalize_methods
    @methods_error = nil
    self.methods = NotificationDestinationSchema.methods(methods)
  rescue NotificationDestinationSchema::Invalid => error
    @methods_error = error
  end

  def methods_are_valid
    errors.add(:base, @methods_error.message) if @methods_error
  end

  def remove_from_rules
    user.message_rules.where("actions -> 'destination_ids' @> ?", [id].to_json).find_each do |rule|
      actions = rule.actions.merge("destination_ids" => rule.destination_ids - [id])
      enabled = rule.enabled? && rule.actions_configured?(actions)
      rule.update!(actions:, enabled:)
    end
  end
end
