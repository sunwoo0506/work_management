/**
 * 하루의 흐름 계산.
 *
 * 일지는 기록이 아니라 **어제와 오늘을 잇는 장치**다 (설계서 §5.7).
 * 그 이음새를 여기서 계산한다.
 *
 * ⚠️ 전부 로컬 벽시계 기준. 사용자가 보는 "오늘"은 자기 시계다.
 */

export type LogSnapshotItem = {
  taskId: string
  title: string
  /** 그날 어떤 상태가 됐나 */
  status: string
  area: string | null
  /** 그날 진행률 */
  progress: number
}

export type TodoLike = {
  id: string
  title: string
  promote: boolean
  promoted_task_id: string | null
}

export type YesterdayStory = {
  /** 전날 일지에 적은 이슈·막힌 것 */
  issues: string | null
  /** 전날 완료한 업무 */
  finished: LogSnapshotItem[]
  /** 「업무로」 체크하지 않아 메모로만 남은 것 */
  keptAsMemo: string[]
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** 로컬 달력일. toISOString()은 UTC라 하루가 밀린다 */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function shiftDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)
}

/**
 * 「오늘 진행한 업무」 스냅샷을 만든다.
 *
 * 그날 갱신된 업무를 굳혀서 담는다. 굳은 뒤에는 업무를 수정해도
 * 일지가 바뀌지 않는다 — 연말에 "3월에 뭐 했더라"를 되짚기 위해서다.
 */
export function buildSnapshot(
  tasks: readonly {
    id: string
    title: string
    status: string
    area: string | null
    progress: number
    updated_at: string
  }[],
  date: Date,
): LogSnapshotItem[] {
  const target = ymd(date)
  return tasks
    .filter((t) => ymd(new Date(t.updated_at)) === target)
    .map((t) => ({
      taskId: t.id,
      title: t.title,
      status: t.status,
      area: t.area,
      progress: t.progress,
    }))
}

/**
 * 「어제 이야기」를 만든다.
 *
 * 전날 일지가 없으면 빈 이야기를 돌려준다 — 일지를 안 쓴 날이 있어도
 * 화면이 깨지면 안 된다.
 */
export function buildYesterdayStory(
  prevLog: { issues: string | null; snapshot: unknown } | null,
  prevTodos: readonly TodoLike[],
): YesterdayStory {
  if (!prevLog) {
    return { issues: null, finished: [], keptAsMemo: [] }
  }

  const snapshot = Array.isArray(prevLog.snapshot)
    ? (prevLog.snapshot as LogSnapshotItem[])
    : []

  return {
    issues: prevLog.issues?.trim() ? prevLog.issues : null,
    finished: snapshot.filter((s) => s.status === '완료'),
    keptAsMemo: prevTodos.filter((t) => !t.promote).map((t) => t.title),
  }
}

/** 이야기할 게 하나라도 있나 */
export function hasStory(s: YesterdayStory): boolean {
  return !!s.issues || s.finished.length > 0 || s.keptAsMemo.length > 0
}
