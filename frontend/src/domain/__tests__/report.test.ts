import { describe, expect, it } from 'vitest'
import { buildReport, periodRange, ymd } from '../report'
import type { TaskLike } from '../report'

const 화요일 = new Date(2026, 7, 11) // 2026-08-11 (화)

function task(over: Partial<TaskLike> & { id: string }): TaskLike {
  return {
    title: '업무', status: '완료', area: null, priority: 'P1', source: '내 발의',
    due_date: null, directive_id: null,
    updated_at: new Date(2026, 7, 11, 10, 0).toISOString(),
    ...over,
  }
}

const EMPTY = { proceduresConfirmed: 0, runsFinishedInRange: 0, exceptionsHandledInRange: 0 }

describe('periodRange', () => {
  it('주간은 월요일부터 일요일까지', () => {
    expect(periodRange('주간', 화요일)).toEqual({ from: '2026-08-10', to: '2026-08-16' })
  })

  it('주간 — 일요일이면 그 주의 월요일부터', () => {
    const 일요일 = new Date(2026, 7, 16)
    expect(periodRange('주간', 일요일)).toEqual({ from: '2026-08-10', to: '2026-08-16' })
  })

  it('월간은 1일부터 말일까지', () => {
    expect(periodRange('월간', 화요일)).toEqual({ from: '2026-08-01', to: '2026-08-31' })
  })

  it('월간 — 2월 말일을 정확히 잡는다', () => {
    expect(periodRange('월간', new Date(2026, 1, 10)).to).toBe('2026-02-28')
  })

  it('연간은 1월 1일부터 12월 31일까지', () => {
    expect(periodRange('연간', 화요일)).toEqual({ from: '2026-01-01', to: '2026-12-31' })
  })
})

describe('buildReport', () => {
  it('기간 안에 완료된 것만 센다', () => {
    const tasks = [
      task({ id: 'A' }), // 8/11 완료
      task({ id: 'B', updated_at: new Date(2026, 7, 3, 10, 0).toISOString() }), // 지난 주
    ]
    expect(buildReport('주간', 화요일, { tasks, ...EMPTY }).doneCount).toBe(1)
  })

  it('완료가 아닌 것은 세지 않는다', () => {
    const tasks = [task({ id: 'A', status: '진행중' }), task({ id: 'B' })]
    expect(buildReport('주간', 화요일, { tasks, ...EMPTY }).doneCount).toBe(1)
  })

  it('영역별로 묶고 많은 순으로 정렬한다', () => {
    const tasks = [
      task({ id: 'A', area: '재고' }),
      task({ id: 'B', area: '재고' }),
      task({ id: 'C', area: '자금·현금' }),
    ]
    const r = buildReport('주간', 화요일, { tasks, ...EMPTY })
    expect(r.byArea).toEqual([
      { area: '재고', count: 2 },
      { area: '자금·현금', count: 1 },
    ])
  })

  it('영역이 없으면 미분류로 묶는다', () => {
    const r = buildReport('주간', 화요일, { tasks: [task({ id: 'A' })], ...EMPTY })
    expect(r.byArea).toEqual([{ area: '미분류', count: 1 }])
  })

  it('절차에서 나온 업무를 따로 센다', () => {
    const tasks = [task({ id: 'A', source: '절차' }), task({ id: 'B', source: '인박스' })]
    expect(buildReport('주간', 화요일, { tasks, ...EMPTY }).fromProcedure).toBe(1)
  })

  it('기한이 지났는데 안 끝난 것을 센다', () => {
    const tasks = [
      task({ id: 'A', status: '진행중', due_date: '2026-08-01' }),
      task({ id: 'B', status: '보류', due_date: '2026-08-01' }), // 보류는 제외
      task({ id: 'C', status: '완료', due_date: '2026-08-01' }), // 완료는 제외
    ]
    expect(buildReport('주간', 화요일, { tasks, ...EMPTY }).overdueCount).toBe(1)
  })

  it('완료한 업무 제목을 남긴다 — 연말에 되짚기 위해', () => {
    const tasks = [task({ id: 'A', title: '월 마감' }), task({ id: 'B', title: '재고 실사' })]
    expect(buildReport('월간', 화요일, { tasks, ...EMPTY }).doneTitles).toEqual([
      '월 마감', '재고 실사',
    ])
  })

  it('절차·회차·예외 수를 그대로 담는다', () => {
    const r = buildReport('월간', 화요일, {
      tasks: [],
      proceduresConfirmed: 4,
      runsFinishedInRange: 7,
      exceptionsHandledInRange: 2,
    })
    expect(r.proceduresConfirmed).toBe(4)
    expect(r.runsFinished).toBe(7)
    expect(r.exceptionsHandled).toBe(2)
  })

  it('기간 정보를 함께 담는다 — 나중에 무슨 기간이었는지 알아야 한다', () => {
    const r = buildReport('월간', 화요일, { tasks: [], ...EMPTY })
    expect(r).toMatchObject({ kind: '월간', from: '2026-08-01', to: '2026-08-31' })
  })
})

describe('ymd', () => {
  it('로컬 달력일', () => {
    expect(ymd(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
