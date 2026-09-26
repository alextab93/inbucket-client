import type {
  MessageRule,
  RuleActions,
  RuleConditions,
} from '../../types'

export type EditableRule = Omit<
  MessageRule,
  'id' | 'summary' | 'last_error_code' | 'last_failed_at'
>

export interface RulePreview {
  matches: Array<{
    mailbox: string
    message_id: string
    subject?: string
    sender?: string
    recipients?: string[]
    received_at?: string
    size?: number
  }>
  inspected: number
  incomplete: boolean
}

export const blankConditions = (): RuleConditions => ({
  mailboxes: [],
  senders: [],
  recipients: [],
  tag_ids: [],
  time_windows: [],
})

export const blankTimeWindow = () => ({ days: [], start: '', finish: '' })

export const blankActions = (): RuleActions => ({
  in_app: false,
  browser: false,
  destination_ids: [],
  star: false,
  mark_read: false,
  tag_ids: [],
  move_to_trash: false,
})

export const blankRule = (): EditableRule => ({
  name: '',
  enabled: true,
  priority: 0,
  cooldown_seconds: 300,
  schema_version: 4,
  conditions: blankConditions(),
  actions: blankActions(),
})

export const inputValue = (value: number | undefined): string =>
  value === undefined ? '' : String(value)

export const ruleForEditing = (rule: MessageRule): EditableRule => ({
  name: rule.name,
  enabled: rule.enabled,
  priority: rule.priority,
  cooldown_seconds: rule.cooldown_seconds,
  schema_version: rule.schema_version,
  conditions: { ...blankConditions(), ...rule.conditions },
  actions: {
    ...blankActions(),
    ...rule.actions,
    destination_ids: rule.actions.destination_ids || [],
    tag_ids: rule.actions.tag_ids || [],
  },
})

export const rulePayload = (rule: EditableRule): EditableRule => ({
  ...rule,
  name: rule.name.trim(),
  conditions: {
    ...rule.conditions,
    mailboxes: rule.conditions.mailboxes,
    senders: rule.conditions.senders,
    recipients: rule.conditions.recipients,
    tag_ids: [...new Set(rule.conditions.tag_ids)].sort((a, b) => a - b),
    time_windows: rule.conditions.time_windows.filter(
      (window) => window.days.length && window.start && window.finish,
    ),
  },
  actions: {
    ...rule.actions,
    destination_ids: [...new Set(rule.actions.destination_ids)].sort(
      (a, b) => a - b,
    ),
    tag_ids: [...new Set(rule.actions.tag_ids)].sort((a, b) => a - b),
  },
})

export const splitCommaSeparated = (value: string): string[] =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
