import type { RuleLuaState } from '../../types'

export const RuleBridgeStatus = ({ state }: { state: RuleLuaState | null }) => {
  if (!state?.last_error_code) return null

  return (
    <section className="rule-bridge-status" role="status">
      <strong>Rule event bridge needs attention.</strong>
      <span>The last known working bridge remains active.</span>
    </section>
  )
}
