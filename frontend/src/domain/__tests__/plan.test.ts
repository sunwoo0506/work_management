import { describe, expect, it } from 'vitest'
import {
  goalProgress,
  layoutWeek,
  parseGoals,
  planLabel,
  planRange,
  shiftPeriod,
  unplaced,
  ymd,
} from '../plan'
import type { PlanTask } from '../plan'

// 날짜는 반드시 로컬 벽시계 리터럴로 쓴다.
// ISO 문자열은 절대 시각을 고정하는데 구현은 로컬 달력일을 본다 (CLAUDE.md).

function task(over: Partial<PlanTask> = {}): PlanTask {
  return {
    id: 'x',
    title: '업무',
    status: '할 일',
    priority: '보통',
    due_date: null,
    focus_date: null,
    area: null,
    ...over,
  }
}

describe('planRange', () => {
  it('주간은 월요일에서 일요일까지다', () => {
    // 2026-08-12 는 수요일
    expect(planRange('주간', new Date(2026, 7, 12))).toEqual({
      from: '2026-08-10',
      to: '2026-08-16',
    })
  })

  it('일요일은 그 주의 마지막 날이지 다음 주 첫날이 아니다', () => {
    // 2026-08-16 은 일요일
    expect(planRange('주간', new Date(2026, 7, 16))).toEqual({
      from: '2026-08-10',
      to: '2026-08-16',
    })
  })

  it('월요일 당일도 그 주에 속한다', () => {
    expect(planRange('주간', new Date(2026, 7, 10)).from).toBe('2026-08-10')
  })

  it('주간 범위가 달을 넘어가도 잘린 날이 없다', () => {
    // 2026-09-02 는 수요일 → 8/31(월) ~ 9/6(일)
    expect(planRange('주간', new Date(2026, 8, 2))).toEqual({
      from: '2026-08-31',
      to: '2026-09-06',
    })
  })

  it('월간은 그 달의 1일에서 말일까지다', () => {
    expect(planRange('월간', new Date(2026, 7, 12))).toEqual({
      from: '2026-08-01',
      to: '2026-08-31',
    })
  })

  it('2월 말일을 28/29 로 정확히 잡는다', () => {
    expect(planRange('월간', new Date(2026, 1, 5)).to).toBe('2026-02-28')
    expect(planRange('월간', new Date(2028, 1, 5)).to).toBe('2028-02-29') // 윤년
  })
})

describe('shiftPeriod', () => {
  it('주간은 7일씩 옮긴다', () => {
    expect(ymd(shiftPeriod('주간', new Date(2026, 7, 12), -1))).toBe('2026-08-05')
    expect(ymd(shiftPeriod('주간', new Date(2026, 7, 12), 1))).toBe('2026-08-19')
  })

  it('31일에서 한 달을 빼도 다른 달로 튀지 않는다', () => {
    // 날짜를 유지한 채 옮기면 3/31 - 1개월 = 3/3 이 되어 버린다
    const back = shiftPeriod('월간', new Date(2026, 2, 31), -1)
    expect(back.getMonth()).toBe(1) // 2월
    expect(planRange('월간', back).from).toBe('2026-02-01')
  })

  it('연말을 넘겨도 해가 맞다', () => {
    expect(planRange('월간', shiftPeriod('월간', new Date(2026, 11, 15), 1)).from)
      .toBe('2027-01-01')
  })
})

describe('planLabel', () => {
  it('월간은 몇 년 몇 월로 읽힌다', () => {
    expect(planLabel('월간', new Date(2026, 7, 12))).toBe('2026년 8월')
  })

  it('주간은 그 주 월요일이 속한 달의 주차로 읽힌다', () => {
    // 8/10(월) 은 8월 둘째 주
    expect(planLabel('주간', new Date(2026, 7, 12))).toBe('2026년 8월 2주차')
  })

  it('달을 걸친 주는 월요일이 있는 달을 따른다', () => {
    // 8/31(월) ~ 9/6(일) → 8월 5주차
    expect(planLabel('주간', new Date(2026, 8, 2))).toBe('2026년 8월 5주차')
  })
})

describe('layoutWeek', () => {
  it('일곱 칸이 월요일부터 나온다', () => {
    const slots = layoutWeek(new Date(2026, 7, 12), [])
    expect(slots).toHaveLength(7)
    expect(slots[0]).toMatchObject({ name: '월', date: '2026-08-10' })
    expect(slots[6]).toMatchObject({ name: '일', date: '2026-08-16' })
  })

  it('배치일을 기한보다 먼저 본다', () => {
    // 기한은 금요일인데 수요일에 하기로 정한 업무
    const slots = layoutWeek(new Date(2026, 7, 12), [
      task({ id: 'a', focus_date: '2026-08-12', due_date: '2026-08-14' }),
    ])
    expect(slots[2].tasks.map((t) => t.id)).toEqual(['a']) // 수
    expect(slots[4].tasks).toHaveLength(0)                 // 금
  })

  it('배치일이 없으면 기한 칸에 놓는다', () => {
    const slots = layoutWeek(new Date(2026, 7, 12), [task({ id: 'b', due_date: '2026-08-14' })])
    expect(slots[4].tasks.map((t) => t.id)).toEqual(['b'])
  })

  it('완료·보류는 배치하지 않는다', () => {
    const slots = layoutWeek(new Date(2026, 7, 12), [
      task({ id: 'c', status: '완료', due_date: '2026-08-12' }),
      task({ id: 'd', status: '보류', due_date: '2026-08-12' }),
    ])
    expect(slots.flatMap((s) => s.tasks)).toHaveLength(0)
  })

  it('이 주 밖의 날짜는 어느 칸에도 안 들어간다', () => {
    const slots = layoutWeek(new Date(2026, 7, 12), [task({ id: 'e', due_date: '2026-09-01' })])
    expect(slots.flatMap((s) => s.tasks)).toHaveLength(0)
  })
})

describe('unplaced', () => {
  const ref = new Date(2026, 7, 12) // 8/10 ~ 8/16

  it('기한이 이번 주인데 날짜를 안 정한 것을 담는다', () => {
    expect(unplaced('주간', ref, [task({ id: 'a', due_date: '2026-08-14' })]).map((t) => t.id))
      .toEqual(['a'])
  })

  it('이미 어느 날에 놓인 것은 안 담는다', () => {
    expect(unplaced('주간', ref, [task({ focus_date: '2026-08-12' })])).toHaveLength(0)
  })

  it('기한도 배치일도 없는 것은 후보로 담는다', () => {
    expect(unplaced('주간', ref, [task({ id: 'b' })]).map((t) => t.id)).toEqual(['b'])
  })

  it('기한이 이번 주 밖이면 안 담는다', () => {
    expect(unplaced('주간', ref, [task({ due_date: '2026-09-01' })])).toHaveLength(0)
  })

  it('완료·보류는 안 담는다', () => {
    expect(unplaced('주간', ref, [
      task({ status: '완료' }),
      task({ status: '보류' }),
    ])).toHaveLength(0)
  })

  it('월간은 그 달 전체를 본다', () => {
    expect(unplaced('월간', ref, [task({ id: 'c', due_date: '2026-08-28' })]).map((t) => t.id))
      .toEqual(['c'])
  })
})

describe('goalProgress', () => {
  it('목표가 없으면 0 이다', () => {
    expect(goalProgress([])).toBe(0)
  })

  it('절반을 끝내면 50 이다', () => {
    expect(goalProgress([
      { text: 'a', done: true },
      { text: 'b', done: false },
    ])).toBe(50)
  })

  it('세 개 중 하나면 33 으로 반올림한다', () => {
    expect(goalProgress([
      { text: 'a', done: true },
      { text: 'b', done: false },
      { text: 'c', done: false },
    ])).toBe(33)
  })
})

describe('parseGoals', () => {
  it('정상 형태를 그대로 읽는다', () => {
    expect(parseGoals([{ text: 'a', done: true }])).toEqual([{ text: 'a', done: true }])
  })

  it('배열이 아니면 빈 목록이다 — 화면이 죽으면 안 된다', () => {
    expect(parseGoals(null)).toEqual([])
    expect(parseGoals({ text: 'a' })).toEqual([])
    expect(parseGoals('a')).toEqual([])
  })

  it('깨진 항목만 버리고 나머지는 살린다', () => {
    expect(parseGoals([{ text: 'a' }, null, 3, { done: true }, { text: 'b', done: true }]))
      .toEqual([{ text: 'a', done: false }, { text: 'b', done: true }])
  })
})
