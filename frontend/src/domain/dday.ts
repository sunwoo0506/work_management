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

/**
 * 오늘이 기한인가 — 목록에서 눈에 띄게 할 대상.
 *
 * 「임박」(7일 이내)과 따로 두는 이유 — 7일 남은 것과 오늘 끝내야 하는 것은
 * 오늘 아침에 할 행동이 다르다. 같은 회색 배지로 묶으면 그 차이가 사라진다.
 *
 * 완료·보류는 제외한다. 이미 손을 뗀 일에 오늘 마감 표시가 붙으면
 * 표시 자체를 안 믿게 된다.
 */
export function isDueToday(
  task: { status: TaskStatus | string; due_date: string | null },
  today: Date,
): boolean {
  if (task.status === '완료' || task.status === '보류') return false
  return daysUntil(task.due_date, today) === 0
}

export function ddayLabel(d: number | null): string {
  if (d === null) return '기한 미정'
  if (d === 0) return '오늘 마감'
  if (d > 0) return `D-${d}`
  return `${Math.abs(d)}일 지연`
}
