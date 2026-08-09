import { describe, it, expect } from 'vitest'
import { rollupByDirective } from '../rollup'

const directives = [
  { id: 'd1', code: 'D-01', title: '품목구분 확정' },
  { id: 'd2', code: 'D-03', title: '단위환산 기준' },
]

const tasks = [
  { id: 't1', directive_id: 'd1', start_date: '2026-08-10', due_date: '2026-08-24', progress: 100, status: '완료' },
  { id: 't2', directive_id: 'd1', start_date: '2026-08-12', due_date: '2026-08-20', progress: 20,  status: '진행중' },
  { id: 't3', directive_id: 'd2', start_date: '2026-08-17', due_date: '2026-08-24', progress: 0,   status: '할 일' },
  { id: 't4', directive_id: null,  start_date: '2026-08-11', due_date: '2026-08-11', progress: 0,  status: '할 일' },
]

describe('rollupByDirective', () => {
  it('지시사항별로 묶는다', () => {
    const r = rollupByDirective(directives, tasks)
    expect(r.map(x => x.code)).toEqual(['D-01', 'D-03'])
  })

  it('시작일은 최소, 마감일은 최대', () => {
    const [d1] = rollupByDirective(directives, tasks)
    expect(d1.startDate).toBe('2026-08-10')
    expect(d1.dueDate).toBe('2026-08-24')
  })

  it('진행률은 평균을 반올림한다', () => {
    const [d1] = rollupByDirective(directives, tasks)
    expect(d1.progress).toBe(60)
  })

  it('완료 건수와 전체 건수를 센다', () => {
    const [d1] = rollupByDirective(directives, tasks)
    expect(d1.doneCount).toBe(1)
    expect(d1.totalCount).toBe(2)
  })

  it('업무가 없는 지시사항은 진행률 0에 날짜 null', () => {
    const r = rollupByDirective([{ id: 'd9', code: 'D-09', title: '없음' }], tasks)
    expect(r[0]).toMatchObject({ progress: 0, totalCount: 0, startDate: null, dueDate: null })
  })

  it('지시사항에 연결되지 않은 업무는 무시한다', () => {
    const r = rollupByDirective(directives, tasks)
    expect(r.reduce((s, x) => s + x.totalCount, 0)).toBe(3)
  })
})
