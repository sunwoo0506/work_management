import { describe, expect, it } from 'vitest'
import { nextDue, isDue, periodLabel } from '../trigger'
import type { Trigger } from '../trigger'

/**
 * 픽스처는 로컬 벽시계 리터럴을 쓴다.
 * ISO 문자열은 절대 시각을 고정하는데 구현은 로컬 달력일을 본다.
 * UTC 오프셋이 음수인 지역에서 하루가 밀려 깨진다.
 */
const 화요일 = new Date(2026, 7, 11) // 2026-08-11 (화)

describe('nextDue — 다음 도래일', () => {
  it('일간은 그날이 곧 도래일이다', () => {
    const t: Trigger = { type: '일', rule: {} }
    expect(nextDue(t, 화요일)).toBe('2026-08-11')
  })

  it('주간은 지정 요일. 오늘이 그 요일이면 오늘이다', () => {
    // 화요일 = 2
    expect(nextDue({ type: '주', rule: { weekday: 2 } }, 화요일)).toBe('2026-08-11')
  })

  it('주간 — 지난 요일이면 다음 주로 넘어간다', () => {
    // 월요일(1)은 이미 지났으므로 다음 주 월요일
    expect(nextDue({ type: '주', rule: { weekday: 1 } }, 화요일)).toBe('2026-08-17')
  })

  it('주간 — 아직 안 온 요일이면 이번 주 안에서', () => {
    // 금요일(5)
    expect(nextDue({ type: '주', rule: { weekday: 5 } }, 화요일)).toBe('2026-08-14')
  })

  it('월간 — 이번 달에 아직 안 왔으면 이번 달', () => {
    expect(nextDue({ type: '월', rule: { dayOfMonth: 25 } }, 화요일)).toBe('2026-08-25')
  })

  it('월간 — 이미 지났으면 다음 달', () => {
    expect(nextDue({ type: '월', rule: { dayOfMonth: 5 } }, 화요일)).toBe('2026-09-05')
  })

  it('월간 — 오늘이 그날이면 오늘', () => {
    expect(nextDue({ type: '월', rule: { dayOfMonth: 11 } }, 화요일)).toBe('2026-08-11')
  })

  it('월간 — 31일 지정인데 그 달에 31일이 없으면 말일로 당긴다', () => {
    const 이월 = new Date(2026, 1, 10) // 2026-02-10
    expect(nextDue({ type: '월', rule: { dayOfMonth: 31 } }, 이월)).toBe('2026-02-28')
  })

  it('분기 — 분기 종료 후 N일', () => {
    // 2026-08-11 은 3분기. 3분기 종료 9/30 + 25일 = 10/25
    expect(nextDue({ type: '분기', rule: { offsetDays: 25 } }, 화요일)).toBe('2026-10-25')
  })

  it('분기 — 이번 분기 도래일이 지났으면 다음 분기', () => {
    const 시월말 = new Date(2026, 9, 26) // 2026-10-26, 3분기 도래일(10/25) 지남
    expect(nextDue({ type: '분기', rule: { offsetDays: 25 } }, 시월말)).toBe('2027-01-25')
  })

  it('연간 — 지정한 월·일', () => {
    expect(nextDue({ type: '연', rule: { month: 3, dayOfMonth: 31 } }, 화요일)).toBe('2027-03-31')
  })

  it('연간 — 올해 아직 안 왔으면 올해', () => {
    expect(nextDue({ type: '연', rule: { month: 12, dayOfMonth: 31 } }, 화요일)).toBe('2026-12-31')
  })

  it('이벤트·수동은 도래일을 계산하지 않는다', () => {
    expect(nextDue({ type: '이벤트', rule: {} }, 화요일)).toBeNull()
    expect(nextDue({ type: '수동', rule: {} }, 화요일)).toBeNull()
  })

  it('규칙이 비어 있으면 계산하지 않는다', () => {
    expect(nextDue({ type: '주', rule: {} }, 화요일)).toBeNull()
    expect(nextDue({ type: '월', rule: {} }, 화요일)).toBeNull()
  })
})

describe('isDue — 지금 실행할 때가 됐나', () => {
  it('도래일이 오늘이면 참', () => {
    expect(isDue({ type: '월', rule: { dayOfMonth: 11 } }, 화요일, null)).toBe(true)
  })

  it('도래일이 아직 안 왔으면 거짓', () => {
    expect(isDue({ type: '월', rule: { dayOfMonth: 25 } }, 화요일, null)).toBe(false)
  })

  it('이번 기간에 이미 실행했으면 거짓', () => {
    const t: Trigger = { type: '월', rule: { dayOfMonth: 11 } }
    expect(isDue(t, 화요일, '2026-08')).toBe(false)
  })

  it('지난 기간에 실행했으면 참', () => {
    const t: Trigger = { type: '월', rule: { dayOfMonth: 11 } }
    expect(isDue(t, 화요일, '2026-07')).toBe(true)
  })

  it('이벤트·수동은 항상 거짓 — 사람이 시작한다', () => {
    expect(isDue({ type: '이벤트', rule: {} }, 화요일, null)).toBe(false)
  })
})

describe('periodLabel — 이번 회차의 대상기간', () => {
  it('일간은 날짜', () => {
    expect(periodLabel({ type: '일', rule: {} }, 화요일)).toBe('2026-08-11')
  })

  it('주간은 그 주의 월요일', () => {
    expect(periodLabel({ type: '주', rule: { weekday: 2 } }, 화요일)).toBe('2026-W 08-10')
  })

  it('월간은 연-월', () => {
    expect(periodLabel({ type: '월', rule: { dayOfMonth: 25 } }, 화요일)).toBe('2026-08')
  })

  it('분기는 연-분기', () => {
    expect(periodLabel({ type: '분기', rule: { offsetDays: 25 } }, 화요일)).toBe('2026-Q3')
  })

  it('연간은 연도', () => {
    expect(periodLabel({ type: '연', rule: { month: 3, dayOfMonth: 31 } }, 화요일)).toBe('2026')
  })

  it('이벤트·수동은 날짜로 남긴다', () => {
    expect(periodLabel({ type: '수동', rule: {} }, 화요일)).toBe('2026-08-11')
  })
})
