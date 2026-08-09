import { scheduleOf } from './dday'
import type { Schedule } from './types'

const SCHEDULE_RANK: Record<Schedule, number> = {
  '지연': 0, '임박': 1, '정상': 2, '기한없음': 3, '보류': 4, '완료': 5,
}

const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2 }

type Sortable = { priority: string; due_date: string | null; status: string }

export function sortTasks<T extends Sortable>(rows: readonly T[], today: Date): T[] {
  return [...rows].sort((a, b) => {
    const sa = SCHEDULE_RANK[scheduleOf(a, today)]
    const sb = SCHEDULE_RANK[scheduleOf(b, today)]
    if (sa !== sb) return sa - sb

    const pa = PRIORITY_RANK[a.priority] ?? 9
    const pb = PRIORITY_RANK[b.priority] ?? 9
    if (pa !== pb) return pa - pb

    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
    if (a.due_date) return -1
    if (b.due_date) return 1
    return 0
  })
}
