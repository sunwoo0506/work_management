export type DirectiveLike = { id: string; code: string; title: string }

export type TaskLike = {
  id: string
  directive_id: string | null
  start_date: string | null
  due_date: string | null
  progress: number
  status: string
}

export type DirectiveRollup = DirectiveLike & {
  startDate: string | null
  dueDate: string | null
  progress: number
  doneCount: number
  totalCount: number
}

function minOf(values: (string | null)[]): string | null {
  const present = values.filter((v): v is string => Boolean(v))
  return present.length ? present.reduce((a, b) => (a < b ? a : b)) : null
}

function maxOf(values: (string | null)[]): string | null {
  const present = values.filter((v): v is string => Boolean(v))
  return present.length ? present.reduce((a, b) => (a > b ? a : b)) : null
}

/** 지시사항별로 소속 업무의 기간·진행률·완료 건수를 집계한다. */
export function rollupByDirective(
  directives: readonly DirectiveLike[],
  tasks: readonly TaskLike[],
): DirectiveRollup[] {
  return directives.map((d) => {
    const own = tasks.filter((t) => t.directive_id === d.id)
    const total = own.length
    const sum = own.reduce((s, t) => s + t.progress, 0)
    return {
      ...d,
      startDate: minOf(own.map((t) => t.start_date)),
      dueDate: maxOf(own.map((t) => t.due_date)),
      progress: total ? Math.round(sum / total) : 0,
      doneCount: own.filter((t) => t.status === '완료').length,
      totalCount: total,
    }
  })
}
