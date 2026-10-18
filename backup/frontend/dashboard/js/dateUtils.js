export function toLocalDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function notBeforeTodayDateKey(dateKey, todayKey = toLocalDateKey()) {
  if (typeof dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return todayKey
  }
  const [year, month, day] = dateKey.split('-').map(Number)
  const parsedDate = new Date(year, month - 1, day)
  const isValidDate = parsedDate.getFullYear() === year &&
    parsedDate.getMonth() === month - 1 &&
    parsedDate.getDate() === day
  return isValidDate && dateKey >= todayKey ? dateKey : todayKey
}

export function parseLocalDate(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function addDaysToDateKey(dateKey, days) {
  const date = parseLocalDate(dateKey)
  date.setDate(date.getDate() + days)
  return toLocalDateKey(date)
}

export function getDateDayOffset(dateKey, referenceDate = new Date()) {
  const target = dateKey.split('-').map(Number)
  const reference = [referenceDate.getFullYear(), referenceDate.getMonth() + 1, referenceDate.getDate()]
  const targetUtc = Date.UTC(target[0], target[1] - 1, target[2])
  const referenceUtc = Date.UTC(reference[0], reference[1] - 1, reference[2])
  return Math.round((targetUtc - referenceUtc) / 86400000)
}

export function formatRelativeDate(dateKey, referenceDate = new Date()) {
  const offset = getDateDayOffset(dateKey, referenceDate)
  if (offset === 0) return 'Today'
  if (offset === 1) return 'Tomorrow'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(parseLocalDate(dateKey))
}
