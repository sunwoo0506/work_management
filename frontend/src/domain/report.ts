/**
 * 리포트 집계 (설계서 §5.5).
 *
 * 주간·월간·연간 리포트는 **밖으로 나가지 않는 내부 자료**다.
 * 사용자 본인의 모니터링과 연말 성과평가에 쓴다.
 *
 * 확정하면 스냅샷으로 굳는다 — 나중에 업무를 수정해도 지난 리포트는
 * 변하지 않는다. 그래서 집계를 여기서 순수 함수로 계산하고,
 * 결과를 통째로 저장한다.
 */

export type ReportKind = '주간' | '월간' | '연간'

export type TaskLike = {
  id: string
  title: string
  status: string
  area: string | null
  priority: string
  source: string
  due_date: string | null
  updated_at: string
  directive_id: string | null
}

export type ReportSnapshot = {
  kind: ReportKind
  from: string
  to: string
  /** 기간 안에 완료된 업무 */
  doneCount: number
  /** 기간 끝 시점에 아직 안 끝난 것 중 기한이 지난 것 */
  overdueCount: number
  /** 영역별 완료 건수 */
  byArea: { area: string; count: number }[]
  /** 중요도별 완료 건수 */
  byPriority: { priority: string; count: number }[]
  /** 절차에서 나온 업무 건수 */
  fromProcedure: number
  /** 확정된 절차 수 */
  proceduresConfirmed: number
  /** 기간 안에 끝난 회차 수 */
  runsFinished: number
  /** 확인 처리한 예외 수 */
  exceptionsHandled: number
  /** 완료한 업무 제목 (성과평가에서 되짚을 때 쓴다) */
  doneTitles: string[]
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 기간의 시작·끝. 로컬 달력일 기준 */
export function periodRange(kind: ReportKind, ref: Date): { from: string; to: string } {
  const y = ref.getFullYear()
  const m = ref.getMonth()

  if (kind === '연간') {
    return { from: `${y}-01-01`, to: `${y}-12-31` }
  }
  if (kind === '월간') {
    const last = new Date(y, m + 1, 0).getDate()
    return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(last)}` }
  }
  // 주간 — 월요일부터 일요일까지
  const back = (ref.getDay() + 6) % 7
  const mon = new Date(y, m, ref.getDate() - back)
  const sun = new Date(y, m, ref.getDate() - back + 6)
  return { from: ymd(mon), to: ymd(sun) }
}

function inRange(dateStr: string, from: string, to: string): boolean {
  return dateStr >= from && dateStr <= to
}

function countBy<T extends string>(items: readonly T[]): { key: T; count: number }[] {
  const map = new Map<T, number>()
  for (const i of items) map.set(i, (map.get(i) ?? 0) + 1)
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}

export function buildReport(
  kind: ReportKind,
  ref: Date,
  input: {
    tasks: readonly TaskLike[]
    proceduresConfirmed: number
    runsFinishedInRange: number
    exceptionsHandledInRange: number
  },
): ReportSnapshot {
  const { from, to } = periodRange(kind, ref)

  const done = input.tasks.filter(
    (t) => t.status === '완료' && inRange(ymd(new Date(t.updated_at)), from, to),
  )

  const overdue = input.tasks.filter(
    (t) => t.status !== '완료' && t.status !== '보류' && t.due_date !== null && t.due_date < to,
  )

  return {
    kind,
    from,
    to,
    doneCount: done.length,
    overdueCount: overdue.length,
    byArea: countBy(done.map((t) => t.area ?? '미분류')).map((x) => ({
      area: x.key, count: x.count,
    })),
    byPriority: countBy(done.map((t) => t.priority)).map((x) => ({
      priority: x.key, count: x.count,
    })),
    fromProcedure: done.filter((t) => t.source === '절차').length,
    proceduresConfirmed: input.proceduresConfirmed,
    runsFinished: input.runsFinishedInRange,
    exceptionsHandled: input.exceptionsHandledInRange,
    doneTitles: done.map((t) => t.title),
  }
}
