import { describe, expect, it } from 'vitest'
import {
  axisTicks,
  buildTimeline,
  monthLabel,
  monthWindow,
  shiftMonth,
  todayMarker,
  ymd,
} from '../timeline'
import type { RollupLike, Window } from '../timeline'

// 날짜는 로컬 벽시계 리터럴로 쓴다 (CLAUDE.md).
const AUG: Window = { from: '2026-08-01', to: '2026-08-31' }

function roll(over: Partial<RollupLike> = {}): RollupLike {
  return {
    id: 'x', code: 'D-01', title: '지시사항',
    startDate: null, dueDate: null,
    progress: 0, doneCount: 0, totalCount: 1,
    ...over,
  }
}

describe('monthWindow', () => {
  it('그 달의 1일에서 말일까지다', () => {
    expect(monthWindow(new Date(2026, 7, 12))).toEqual({ from: '2026-08-01', to: '2026-08-31' })
  })

  it('2월 말일을 28/29 로 잡는다', () => {
    expect(monthWindow(new Date(2026, 1, 5)).to).toBe('2026-02-28')
    expect(monthWindow(new Date(2028, 1, 5)).to).toBe('2028-02-29')
  })
})

describe('shiftMonth', () => {
  it('31일에서 한 달을 빼도 다른 달로 튀지 않는다', () => {
    expect(monthWindow(shiftMonth(new Date(2026, 2, 31), -1)).from).toBe('2026-02-01')
  })

  it('연말을 넘긴다', () => {
    expect(monthLabel(shiftMonth(new Date(2026, 11, 15), 1))).toBe('2027년 1월')
  })
})

describe('todayMarker', () => {
  it('창 밖이면 선을 그리지 않는다', () => {
    expect(todayMarker(AUG, '2026-07-31')).toBeNull()
    expect(todayMarker(AUG, '2026-09-01')).toBeNull()
  })

  it('1일은 왼쪽 끝이 아니라 첫 칸 한가운데다', () => {
    const at = todayMarker(AUG, '2026-08-01')
    expect(at).toBeGreaterThan(0)
    expect(at).toBeLessThan(100 / 31)
  })

  it('말일은 오른쪽 끝 안쪽이다', () => {
    const at = todayMarker(AUG, '2026-08-31')
    expect(at).toBeGreaterThan(100 - 100 / 31)
    expect(at).toBeLessThan(100)
  })

  it('한 달의 절반쯤이면 50% 근처다', () => {
    expect(todayMarker(AUG, '2026-08-16')).toBeCloseTo(50, 0)
  })
})

describe('axisTicks', () => {
  it('1일부터 5일 간격으로 찍고 말일을 더한다', () => {
    expect(axisTicks(AUG).map((t) => t.label)).toEqual(['1', '6', '11', '16', '21', '26', '31'])
  })

  it('눈금이 창 안에 있다', () => {
    for (const t of axisTicks(AUG)) {
      expect(t.at).toBeGreaterThanOrEqual(0)
      expect(t.at).toBeLessThan(100)
    }
  })
})

describe('buildTimeline', () => {
  const today = '2026-08-10'

  it('업무가 하나도 없는 지시사항은 빼놓는다', () => {
    expect(buildTimeline([roll({ totalCount: 0, dueDate: '2026-08-20' })], AUG, today))
      .toHaveLength(0)
  })

  it('기한이 없어도 줄은 남는다 — 보이지 않으면 잊힌다', () => {
    const [b] = buildTimeline([roll({ dueDate: null })], AUG, today)
    expect(b).toMatchObject({ width: 0, end: null, daysLeft: null })
  })

  it('한 달을 꽉 채우면 창 전체를 덮는다', () => {
    const [b] = buildTimeline(
      [roll({ startDate: '2026-08-01', dueDate: '2026-08-31' })], AUG, today,
    )
    expect(b.left).toBeCloseTo(0, 5)
    expect(b.width).toBeCloseTo(100, 5)
  })

  it('마감일 당일도 기간에 포함된다', () => {
    // 8/1~8/1 하루짜리는 31분의 1
    const [b] = buildTimeline(
      [roll({ startDate: '2026-08-01', dueDate: '2026-08-01' })], AUG, today,
    )
    expect(b.width).toBeCloseTo(100 / 31, 5)
  })

  it('진행률만큼 완료 띠가 찬다', () => {
    const [b] = buildTimeline(
      [roll({ startDate: '2026-08-01', dueDate: '2026-08-31', progress: 50 })], AUG, today,
    )
    expect(b.doneWidth).toBeCloseTo(50, 5)
  })

  it('진행률이 0이면 완료 띠가 없다', () => {
    const [b] = buildTimeline(
      [roll({ startDate: '2026-08-05', dueDate: '2026-08-20', progress: 0 })], AUG, today,
    )
    expect(b.doneWidth).toBe(0)
  })

  it('창 왼쪽으로 넘친 기간은 잘리고 표시가 남는다', () => {
    const [b] = buildTimeline(
      [roll({ startDate: '2026-07-20', dueDate: '2026-08-10' })], AUG, today,
    )
    expect(b.left).toBe(0)
    expect(b.clippedLeft).toBe(true)
    expect(b.clippedRight).toBe(false)
  })

  it('창 오른쪽으로 넘친 기간도 잘린다', () => {
    const [b] = buildTimeline(
      [roll({ startDate: '2026-08-20', dueDate: '2026-09-30' })], AUG, today,
    )
    expect(b.left + b.width).toBeCloseTo(100, 5)
    expect(b.clippedRight).toBe(true)
  })

  it('완료 띠는 전체 기간 기준으로 잰 뒤 창에 맞춰 자른다', () => {
    // 7/22~8/31 (41일) 중 절반이면 완료분은 7/22+20일 = 8/11 까지.
    // 창(8월) 안에서는 8/1~8/11 이 보여야 한다
    const [b] = buildTimeline(
      [roll({ startDate: '2026-07-22', dueDate: '2026-08-31', progress: 50 })], AUG, today,
    )
    expect(b.left).toBe(0)
    expect(b.doneWidth).toBeGreaterThan(0)
    expect(b.doneWidth).toBeLessThan(b.width)
  })

  it('완료 띠가 막대를 넘지 않는다', () => {
    const [b] = buildTimeline(
      [roll({ startDate: '2026-08-05', dueDate: '2026-08-10', progress: 100 })], AUG, today,
    )
    expect(b.doneWidth).toBeLessThanOrEqual(b.width + 1e-9)
  })

  it('시작일이 없으면 오늘부터로 보고 표시를 남긴다', () => {
    const [b] = buildTimeline([roll({ dueDate: '2026-08-20' })], AUG, today)
    expect(b.startUnknown).toBe(true)
    expect(b.start).toBeNull()
    expect(b.left).toBeCloseTo(((10 - 1) / 31) * 100, 5) // 8/10 지점
  })

  it('시작일이 없고 기한이 이미 지났으면 기한에 맞춰 접는다', () => {
    const [b] = buildTimeline([roll({ dueDate: '2026-08-05' })], AUG, today)
    expect(b.width).toBeGreaterThan(0)
    expect(b.left + b.width).toBeLessThanOrEqual(100)
  })

  it('기한이 지났고 안 끝났으면 지연이다', () => {
    const [b] = buildTimeline(
      [roll({ startDate: '2026-08-01', dueDate: '2026-08-05', doneCount: 1, totalCount: 3 })],
      AUG, today,
    )
    expect(b.overdue).toBe(true)
    expect(b.daysLeft).toBe(-5)
  })

  it('기한이 지났어도 다 끝냈으면 지연이 아니다', () => {
    const [b] = buildTimeline(
      [roll({ startDate: '2026-08-01', dueDate: '2026-08-05', doneCount: 3, totalCount: 3 })],
      AUG, today,
    )
    expect(b.overdue).toBe(false)
  })

  it('기한이 이른 것이 위로 오고, 기한 없는 것은 맨 아래다', () => {
    const bars = buildTimeline([
      roll({ id: 'c', code: 'D-03', dueDate: null }),
      roll({ id: 'a', code: 'D-01', dueDate: '2026-08-25' }),
      roll({ id: 'b', code: 'D-02', dueDate: '2026-08-12' }),
    ], AUG, today)
    expect(bars.map((b) => b.id)).toEqual(['b', 'a', 'c'])
  })

  it('다른 달을 봐도 계산이 깨지지 않는다', () => {
    const sep: Window = { from: '2026-09-01', to: '2026-09-30' }
    const [b] = buildTimeline(
      [roll({ startDate: '2026-08-20', dueDate: '2026-09-10' })], sep, '2026-09-05',
    )
    expect(b.left).toBe(0)
    expect(b.clippedLeft).toBe(true)
    expect(b.width).toBeCloseTo((10 / 30) * 100, 5)
  })
})

describe('ymd', () => {
  it('로컬 달력일을 그대로 낸다', () => {
    expect(ymd(new Date(2026, 7, 9))).toBe('2026-08-09')
  })
})
