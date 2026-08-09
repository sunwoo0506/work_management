/**
 * 계획 (설계서 §6.8 `plans`, §13 7단계).
 *
 * 리포트와 헷갈리면 안 된다.
 *   plans   = 앞을 본다. 이번 주에 무엇을 할 것인가
 *   reports = 뒤를 본다. 지난 주에 무엇을 했나
 *
 * 여기 있는 것은 전부 계산이다 — 기간 산출, 요일별 배치, 목표 진행률.
 * 판단이 필요 없으므로 AI 를 부르지 않는다.
 */

export type PlanKind = '주간' | '월간'

/** 계획에 적는 목표 한 줄 */
export type Goal = {
  text: string
  done: boolean
}

export type PlanTask = {
  id: string
  title: string
  status: string
  priority: string
  due_date: string | null
  focus_date: string | null
  area: string | null
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * 계획 기간의 시작·끝.
 *
 * 주간은 월요일 ~ 일요일. 리포트와 같은 경계를 쓴다 —
 * 다르면 "계획대로 됐나"를 나란히 볼 수 없다.
 */
export function planRange(kind: PlanKind, ref: Date): { from: string; to: string } {
  const y = ref.getFullYear()
  const m = ref.getMonth()

  if (kind === '월간') {
    const last = new Date(y, m + 1, 0).getDate()
    return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(last)}` }
  }
  const back = (ref.getDay() + 6) % 7
  return {
    from: ymd(new Date(y, m, ref.getDate() - back)),
    to: ymd(new Date(y, m, ref.getDate() - back + 6)),
  }
}

/** 기준일에서 n 기간 이동한 날짜 */
export function shiftPeriod(kind: PlanKind, ref: Date, n: number): Date {
  if (kind === '월간') {
    // 1일로 맞춰 옮긴다. 31일에서 한 달 빼면 3월 3일이 되는 것을 막는다.
    return new Date(ref.getFullYear(), ref.getMonth() + n, 1)
  }
  return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + n * 7)
}

/** 사람이 읽는 기간 이름 */
export function planLabel(kind: PlanKind, ref: Date): string {
  if (kind === '월간') return `${ref.getFullYear()}년 ${ref.getMonth() + 1}월`

  const { from } = planRange('주간', ref)
  const mon = new Date(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)))
  // 그 달의 몇 번째 월요일인가로 주차를 센다
  const week = Math.floor((mon.getDate() - 1) / 7) + 1
  return `${mon.getFullYear()}년 ${mon.getMonth() + 1}월 ${week}주차`
}

const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'] as const

export type DaySlot = {
  date: string
  /** 월~일 */
  name: (typeof DAY_NAMES)[number]
  tasks: PlanTask[]
}

/**
 * 주간 계획의 요일별 배치.
 *
 * 어느 날에 놓을지는 `focus_date`(오늘 할 일로 찍은 날) 를 먼저 보고,
 * 없으면 `due_date`(기한) 를 본다.
 *
 * 이유 — 기한이 금요일이어도 수요일에 하기로 정했으면 수요일 칸에 있어야
 * 실제 배치가 보인다. 기한만 보면 전부 금요일에 몰려 계획이 안 된다.
 */
export function layoutWeek(ref: Date, tasks: readonly PlanTask[]): DaySlot[] {
  const { from } = planRange('주간', ref)
  const y = Number(from.slice(0, 4))
  const m = Number(from.slice(5, 7)) - 1
  const d = Number(from.slice(8, 10))

  const slots: DaySlot[] = DAY_NAMES.map((name, i) => ({
    date: ymd(new Date(y, m, d + i)),
    name,
    tasks: [],
  }))
  const byDate = new Map(slots.map((s) => [s.date, s]))

  for (const t of tasks) {
    if (t.status === '완료' || t.status === '보류') continue
    const at = t.focus_date ?? t.due_date
    if (!at) continue
    byDate.get(at)?.tasks.push(t)
  }
  return slots
}

/**
 * 기간 안에 놓이지 못한 업무.
 *
 * 「이번 주에 해야 하는데 어느 날에 할지 안 정한 것」이다.
 * 계획 화면에서 이게 비어야 한 주가 배치된 것이다.
 *
 * 담는 것 두 가지 —
 *   ① 기한이 이 기간 안인데 어느 날에 할지 안 정한 것
 *   ② 기한도 배치일도 없는 것 (언제든 할 수 있으니 후보로 올린다)
 * 기한이 이 기간 밖인 것은 담지 않는다. 아직 이번 주 일이 아니다.
 */
export function unplaced(kind: PlanKind, ref: Date, tasks: readonly PlanTask[]): PlanTask[] {
  const { from, to } = planRange(kind, ref)
  return tasks.filter((t) => {
    if (t.status === '완료' || t.status === '보류') return false
    if (t.focus_date) return false          // 이미 어느 날에 놓였다
    if (!t.due_date) return true            // ②
    return t.due_date >= from && t.due_date <= to  // ①
  })
}

/** 목표 진행률 (0~100). 목표가 없으면 0 */
export function goalProgress(goals: readonly Goal[]): number {
  if (goals.length === 0) return 0
  return Math.round((goals.filter((g) => g.done).length / goals.length) * 100)
}

/** jsonb 로 저장된 목표를 안전하게 읽는다. 형태가 깨져 있어도 화면이 죽지 않게 */
export function parseGoals(raw: unknown): Goal[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((g) => {
    if (typeof g !== 'object' || g === null) return []
    const text = (g as { text?: unknown }).text
    if (typeof text !== 'string') return []
    return [{ text, done: (g as { done?: unknown }).done === true }]
  })
}
