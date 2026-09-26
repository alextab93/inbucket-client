class RuleLuaState < ApplicationRecord
  validates :desired_revision, presence: true

  def self.current
    first_or_create!(desired_revision: "bootstrap")
  end
end
