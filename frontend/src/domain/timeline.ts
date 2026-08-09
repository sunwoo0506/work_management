/**
 * 진행 중 업무 타임라인 (설계 모형 `progress-block-v4`, `layout-v3`).
 *
 * 지시사항을 막대 하나로 그린다. **마일스톤 역할을 이 블록이 한다** —
 * 그래서 「오늘」 화면에 마일스톤 블록을 따로 두지 않는다.
 *
 * 막대 하나에 세 가지가 겹쳐 있다.
 *   ① 전체 기간   시작일 → 마감일          (연한 띠)
 *   ② 완료된 만큼 전체 기간 × 진행률        (진한 띠)
 *   ③ 오늘 선     지금이 그 기간의 어디쯤인가
 *
 * ②와 ③을 나란히 놓는 것이 이 그림의 전부다. 진행률만 보면 "55% 했다"이지만,
 * 오늘 선이 80% 지점에 있으면 **늦고 있다**는 뜻이다. 숫자로는 안 보인다.
 *
 * ── 날짜 계산에 대하여 ────────────────────────────────────
 * 여기 들어오는 날짜는 전부 'YYYY-MM-DD' 문자열, 즉 이미 로컬 달력일이다.
 * 그 문자열끼리의 뺄셈은 Date.UTC 로 하는 것이 정확하다 — 서머타임이
 * 개입할 여지가 없기 때문이다. 대신 「오늘」은 반드시 로컬 벽시계로
 * 달력일 문자열을 만든 뒤에 넣어야 한다 (ymd 참고).
 */

export type RollupLike = {
  id: string
  code: string
  title: string
  startDate: string | null
  dueDate: string | null
  progress: number
  doneCount: number
  totalCount: number
}

export type Window = { from: string; to: string }

export type Bar = {
  id: string
  code: string
  title: string
  start: string | null
  end: string | null
  /** 창 왼쪽에서의 위치 (%) */
  left: number
  /** 창 안에서 차지하는 폭 (%) */
  width: number
  /** 완료된 만큼의 폭 (%). left 에서 시작한다 */
  doneWidth: number
  /** 기간이 창 밖으로 잘렸나 — 화살표를 붙일지 판단 */
  clippedLeft: boolean
  clippedRight: boolean
  progress: number
  doneCount: number
  totalCount: number
  /** 시작일이 없어 오늘부터로 본 것 */
  startUnknown: boolean
  /** 기한이 지났는데 안 끝났나 */
  overdue: boolean
  /** 마감까지 남은 날. 기한이 없으면 null */
  daysLeft: number | null
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** 로컬 벽시계 기준 달력일. toISOString() 은 UTC 라 하루가 밀릴 수 있다 */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 'YYYY-MM-DD' → 일련번호. 문자열끼리의 날짜 뺄셈에만 쓴다 */
function dayNo(s: string): number {
  return Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) / 86400000
}

/** 그 달의 1일 ~ 말일 */
export function monthWindow(ref: Date): Window {
  const y = ref.getFullYear()
  const m = ref.getMonth()
  return {
    from: `${y}-${pad(m + 1)}-01`,
    to: `${y}-${pad(m + 1)}-${pad(new Date(y, m + 1, 0).getDate())}`,
  }
}

/** 달을 옮긴다. 1일로 맞춰 옮겨 31일에서 한 달 빼면 3월 3일이 되는 것을 막는다 */
export function shiftMonth(ref: Date, n: number): Date {
  return new Date(ref.getFullYear(), ref.getMonth() + n, 1)
}

export function monthLabel(ref: Date): string {
  return `${ref.getFullYear()}년 ${ref.getMonth() + 1}월`
}

/** 날짜가 창 안에서 몇 % 지점인가. 창 밖이면 0 미만 또는 100 초과 */
function pct(date: string, w: Window): number {
  const from = dayNo(w.from)
  const span = dayNo(w.to) - from + 1 // 말일도 하루로 센다
  return ((dayNo(date) - from) / span) * 100
}

/** 오늘이 창 안에서 몇 % 지점인가. 창 밖이면 null — 선을 그리지 않는다 */
export function todayMarker(w: Window, today: string): number | null {
  if (today < w.from || today > w.to) return null
  // 하루의 한가운데를 가리키게 반 칸 민다. 안 그러면 1일이 왼쪽 끝에 붙는다
  const span = dayNo(w.to) - dayNo(w.from) + 1
  return pct(today, w) + 50 / span
}

/** 날짜축 눈금. 5일 간격 + 말일 */
export function axisTicks(w: Window): { label: string; at: number }[] {
  const first = dayNo(w.from)
  const last = dayNo(w.to)
  const ticks: { label: string; at: number }[] = []

  for (let d = first; d <= last; d += 5) {
    const day = d - first + 1
    ticks.push({ label: String(day), at: pct(offset(w.from, d - first), w) })
  }
  const lastDay = last - first + 1
  // 말일이 마지막 눈금과 너무 붙으면 넣지 않는다
  if (lastDay - (ticks[ticks.length - 1] ? Number(ticks[ticks.length - 1].label) : 0) >= 2) {
    ticks.push({ label: String(lastDay), at: pct(w.to, w) })
  }
  return ticks
}

function offset(from: string, days: number): string {
  const d = new Date(dayNo(from) * 86400000 + days * 86400000)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/**
 * 지시사항 집계를 막대로 바꾼다.
 *
 * 창에 걸치지 않는 것은 아예 빼지 않고 `width: 0` 으로 남기지도 않는다 —
 * 목록에서 사라진다. 보이지 않으면 잊힌다.
 *
 * @param today 로컬 달력일 문자열
 */
export function buildTimeline(
  rollups: readonly RollupLike[],
  w: Window,
  today: string,
): Bar[] {
  const bars: Bar[] = []

  for (const r of rollups) {
    if (r.totalCount === 0) continue

    // 시작일이 없으면 오늘부터로 본다. 기한보다 뒤면 기한에 맞춘다
    const startUnknown = r.startDate === null
    let start = r.startDate ?? today
    const end = r.dueDate
    if (end !== null && start > end) start = end

    // 기간을 아예 모르면 막대를 그릴 수 없다. 그래도 줄은 남긴다
    if (end === null) {
      bars.push({
        ...pick(r), start: r.startDate, end: null,
        left: 0, width: 0, doneWidth: 0,
        clippedLeft: false, clippedRight: false,
        startUnknown, overdue: false, daysLeft: null,
      })
      continue
    }

    const rawLeft = pct(start, w)
    const rawRight = pct(end, w) + 100 / (dayNo(w.to) - dayNo(w.from) + 1) // 마감일 당일도 포함

    // 창 밖은 잘라낸다
    const left = Math.max(0, rawLeft)
    const right = Math.min(100, rawRight)
    const width = Math.max(0, right - left)

    bars.push({
      ...pick(r),
      start: r.startDate,
      end,
      left,
      width,
      // 완료분은 **전체 기간 기준**으로 재고, 그 뒤 창에 맞춰 자른다.
      // 창 기준으로 재면 달을 넘길 때 진행률이 달라 보인다
      doneWidth: Math.max(
        0,
        Math.min(right, rawLeft + ((rawRight - rawLeft) * r.progress) / 100) - left,
      ),
      clippedLeft: rawLeft < 0,
      clippedRight: rawRight > 100,
      startUnknown,
      overdue: end < today && r.doneCount < r.totalCount,
      daysLeft: dayNo(end) - dayNo(today),
    })
  }

  // 급한 것이 위로 — 기한이 이른 순, 기한이 없는 것은 맨 아래
  return bars.sort((a, b) => {
    if (a.end === null) return b.end === null ? a.code.localeCompare(b.code) : 1
    if (b.end === null) return -1
    return a.end.localeCompare(b.end) || a.code.localeCompare(b.code)
  })
}

function pick(r: RollupLike) {
  return {
    id: r.id,
    code: r.code,
    title: r.title,
    progress: r.progress,
    doneCount: r.doneCount,
    totalCount: r.totalCount,
  }
}
