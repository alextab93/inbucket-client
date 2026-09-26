import { InfoTooltip } from '../InfoTooltip'
import type { EditableRule } from './ruleForm'

interface RuleBasicsStepProps {
  rule: EditableRule
  onChange: (change: Partial<EditableRule>) => void
}

export const RuleBasicsStep = ({ rule, onChange }: RuleBasicsStepProps) => (
  <section className="rule-step" aria-labelledby="rule-basics">
    <div>
      <h5 id="rule-basics">Name and frequency</h5>
      <p>Give the rule a clear name and choose how often it may run.</p>
    </div>
    <label>
      Name
      <input
        value={rule.name}
        maxLength={80}
        required
        autoFocus
        onChange={(event) => onChange({ name: event.target.value })}
      />
    </label>
    <div className="notification-form-row">
      <label>
        <span className="rule-label-heading">
          Priority
          <InfoTooltip label="Priority">
            Sets the rule list order from 0 to 100. Higher values appear first.
            Priority does not stop lower-priority rules from running.
          </InfoTooltip>
        </span>
        <input
          type="number"
          min="0"
          max="100"
          value={rule.priority}
          onChange={(event) => onChange({ priority: Number(event.target.value) })}
        />
      </label>
      <label>
        <span className="rule-label-heading">
          Cooldown
          <InfoTooltip label="Cooldown">
            Minimum seconds after this rule runs before it can run again.
            Matching messages during that time are skipped. Use 0 to run for
            every match.
          </InfoTooltip>
        </span>
        <input
          type="number"
          min="0"
          max="86400"
          inputMode="numeric"
          value={rule.cooldown_seconds}
          onChange={(event) =>
            onChange({ cooldown_seconds: Number(event.target.value) })
          }
        />
      </label>
    </div>
    <label className="notification-checkbox">
      <input
        type="checkbox"
        checked={rule.enabled}
        onChange={(event) => onChange({ enabled: event.target.checked })}
      />{' '}
      Enable this rule
    </label>
  </section>
)
