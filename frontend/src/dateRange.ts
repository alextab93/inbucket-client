const parsedLocalDate = (value: string, nextDay: boolean): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const base = new Date(year, month, day)
  if (
    base.getFullYear() !== year ||
    base.getMonth() !== month ||
    base.getDate() !== day
  ) {
    return null
  }
  return new Date(year, month, day + (nextDay ? 1 : 0))
}

export const dateRangeInstants = (
  dateFrom: string,
  dateTo: string,
): { receivedAfter: string; receivedBefore: string } => ({
  receivedAfter: parsedLocalDate(dateFrom, false)?.toISOString() || '',
  receivedBefore: parsedLocalDate(dateTo, true)?.toISOString() || '',
})

export const withinDateRange = (
  timestamp: number | null,
  dateFrom: string,
  dateTo: string,
): boolean => {
  if (!dateFrom && !dateTo) return true
  if (timestamp === null) return false
  const after = parsedLocalDate(dateFrom, false)?.getTime()
  const before = parsedLocalDate(dateTo, true)?.getTime()
  return (
    (after === undefined || timestamp >= after) &&
    (before === undefined || timestamp < before)
  )
}
