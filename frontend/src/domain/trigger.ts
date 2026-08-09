/**
 * 주기 트리거 계산.
 *
 * 「반복업무」는 별도 개념이 아니다. 트리거가 「주기」인 절차일 뿐이다.
 * 여기서 "다음에 언제 해야 하나"와 "지금이 그때인가"를 계산한다.
 *
 * ⚠️ 전부 로컬 벽시계 기준이다. 사용자가 보는 "오늘"은 세계 표준시가
 *    아니라 자기 시계다. UTC 로 계산하면 시간대에 따라 하루가 밀린다.
 */

export type TriggerType = '일' | '주' | '월' | '분기' | '연' | '이벤트' | '수동'

export type TriggerRule = {
  /** 주간 — 0=일 … 6=토 */
  weekday?: number
  /** 월간·연간 — 1~31. 그 달에 없으면 말일로 당긴다 */
  dayOfMonth?: number
  /** 연간 — 1~12 */
  month?: number
  /** 분기 — 분기 종료일로부터 며칠 뒤 */
  offsetDays?: number
}

export type Trigger = { type: TriggerType; rule: TriggerRule }

/** 주기가 아닌 것. 사람이 시작한다 */
const MANUAL: readonly TriggerType[] = ['이벤트', '수동']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** 로컬 달력일 문자열. toISOString()은 UTC라 하루가 밀린다 */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** 그 달의 마지막 날. 다음 달 0일 = 이번 달 말일 */
function lastDayOf(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate()
}

/** 지정한 날. 그 달에 없으면 말일로 당긴다 (31일 지정 + 2월) */
function dayIn(year: number, month0: number, day: number): Date {
  return new Date(year, month0, Math.min(day, lastDayOf(year, month0)))
}

/**
 * 다음 도래일. 오늘이 도래일이면 오늘을 돌려준다.
 * 계산할 수 없으면 null (사람이 시작하는 트리거이거나 규칙이 비어 있음).
 */
export function nextDue(trigger: Trigger, today: Date): string | null {
  const { type, rule } = trigger
  if (MANUAL.includes(type)) return null

  const t = atMidnight(today)
  const y = t.getFullYear()
  const m = t.getMonth()

  switch (type) {
    case '일':
      return ymd(t)

    case '주': {
      if (rule.weekday === undefined) return null
      const diff = (rule.weekday - t.getDay() + 7) % 7
      const d = new Date(y, m, t.getDate() + diff)
      return ymd(d)
    }

    case '월': {
      if (rule.dayOfMonth === undefined) return null
      const thisMonth = dayIn(y, m, rule.dayOfMonth)
      if (thisMonth >= t) return ymd(thisMonth)
      return ymd(dayIn(y, m + 1, rule.dayOfMonth))
    }

    case '분기': {
      if (rule.offsetDays === undefined) return null
      // 이번 분기부터 훑어 도래일이 오늘 이후인 첫 분기를 찾는다
      for (let i = 0; i < 5; i++) {
        const q = Math.floor(m / 3) + i
        const qy = y + Math.floor(q / 4)
        const endMonth0 = (q % 4) * 3 + 2 // 분기 마지막 달 (2, 5, 8, 11)
        const end = new Date(qy, endMonth0, lastDayOf(qy, endMonth0))
        const due = new Date(qy, endMonth0, end.getDate() + rule.offsetDays)
        if (due >= t) return ymd(due)
      }
      return null
    }

    case '연': {
      if (rule.month === undefined || rule.dayOfMonth === undefined) return null
      const thisYear = dayIn(y, rule.month - 1, rule.dayOfMonth)
      if (thisYear >= t) return ymd(thisYear)
      return ymd(dayIn(y + 1, rule.month - 1, rule.dayOfMonth))
    }

    default:
      return null
  }
}

/**
 * 지금 실행할 때가 됐나.
 *
 * 도래일이 오늘이거나 지났고, **이번 기간에 아직 안 돌렸으면** 참.
 * lastPeriod 에는 마지막 실행의 대상기간을 넣는다.
 */
export function isDue(trigger: Trigger, today: Date, lastPeriod: string | null): boolean {
  if (MANUAL.includes(trigger.type)) return false

  const due = nextDue(trigger, today)
  if (!due) return false
  if (due > ymd(atMidnight(today))) return false

  return lastPeriod !== periodLabel(trigger, today)
}

/**
 * 이번 회차의 대상기간 표시.
 *
 * "이번 기간에 이미 돌렸나"를 이 값으로 비교하므로,
 * 같은 기간이면 반드시 같은 문자열이 나와야 한다.
 */
export function periodLabel(trigger: Trigger, today: Date): string {
  const t = atMidnight(today)
  const y = t.getFullYear()
  const m = t.getMonth()

  switch (trigger.type) {
    case '주': {
      // 그 주의 월요일로 정규화한다. 요일이 달라도 같은 주면 같은 값
      const back = (t.getDay() + 6) % 7
      const monday = new Date(y, m, t.getDate() - back)
      return `${monday.getFullYear()}-W ${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`
    }
    case '월':
      return `${y}-${pad(m + 1)}`
    case '분기':
      return `${y}-Q${Math.floor(m / 3) + 1}`
    case '연':
      return String(y)
    default:
      return ymd(t)
  }
}

/** 화면에 보여줄 트리거 설명 */
export function describeTrigger(trigger: Trigger): string {
  const { type, rule } = trigger
  const WEEK = ['일', '월', '화', '수', '목', '금', '토']
  switch (type) {
    case '일':
      return '매일'
    case '주':
      return rule.weekday === undefined ? '매주' : `매주 ${WEEK[rule.weekday]}요일`
    case '월':
      return rule.dayOfMonth === undefined ? '매월' : `매월 ${rule.dayOfMonth}일`
    case '분기':
      return rule.offsetDays === undefined ? '분기' : `분기 종료 후 ${rule.offsetDays}일`
    case '연':
      return rule.month && rule.dayOfMonth ? `매년 ${rule.month}월 ${rule.dayOfMonth}일` : '매년'
    case '이벤트':
      return '이벤트가 생기면'
    default:
      return '직접 시작'
  }
}
