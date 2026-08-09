import type { Schedule, TaskStatus } from './types'

/** 로컬 자정 기준으로 날짜만 비교한다. 시각은 무시한다. */
function atMidnight(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const DAY_MS = 86_400_000

export function daysUntil(due: string | null, today: Date): number | null {
  if (!due) return null
  return Math.round((atMidnight(parseDate(due)) - atMidnight(today)) / DAY_MS)
}

export function scheduleOf(
  task: { status: TaskStatus | string; due_date: string | null },
  today: Date,
): Schedule {
  if (task.status === '완료') return '완료'
  if (task.status === '보류') return '보류'
  const d = daysUntil(task.due_date, today)
  if (d === null) return '기한없음'
  if (d < 0) return '지연'
  if (d <= 7) return '임박'
  return '정상'
}

export function ddayLabel(d: number | null): string {
  if (d === null) return '기한 미정'
  if (d === 0) return '오늘 마감'
  if (d > 0) return `D-${d}`
  return `${Math.abs(d)}일 지연`
}
