import { describe, it, expect } from 'vitest'
import { sortTasks } from '../sort'

// 로컬 벽시계 기준. dday.test.ts와 같은 이유로 ISO 문자열을 쓰지 않는다.
const TODAY = new Date(2026, 7, 11, 9, 0)

const t = (id: string, priority: string, due: string | null) => ({
  id, priority, due_date: due, status: '할 일',
})

describe('sortTasks', () => {
  it('지연된 것이 가장 먼저 온다', () => {
    const rows = [t('a', 'P2', '2026-08-20'), t('b', 'P2', '2026-08-01')]
    expect(sortTasks(rows, TODAY).map(r => r.id)).toEqual(['b', 'a'])
  })

  it('같은 일정 상태면 중요도 순', () => {
    const rows = [t('a', 'P2', '2026-08-20'), t('b', 'P0', '2026-08-20')]
    expect(sortTasks(rows, TODAY).map(r => r.id)).toEqual(['b', 'a'])
  })

  it('같은 중요도면 기한이 이른 것 먼저', () => {
    const rows = [t('a', 'P1', '2026-08-25'), t('b', 'P1', '2026-08-20')]
    expect(sortTasks(rows, TODAY).map(r => r.id)).toEqual(['b', 'a'])
  })

  it('기한 없는 것은 맨 뒤', () => {
    const rows = [t('a', 'P0', null), t('b', 'P2', '2026-09-30')]
    expect(sortTasks(rows, TODAY).map(r => r.id)).toEqual(['b', 'a'])
  })

  it('완료는 항상 맨 뒤', () => {
    const rows = [
      { ...t('done', 'P0', '2026-08-01'), status: '완료' },
      t('open', 'P2', '2026-09-30'),
    ]
    expect(sortTasks(rows, TODAY).map(r => r.id)).toEqual(['open', 'done'])
  })

  it('원본 배열을 바꾸지 않는다', () => {
    const rows = [t('a', 'P2', '2026-08-20'), t('b', 'P0', '2026-08-20')]
    sortTasks(rows, TODAY)
    expect(rows.map(r => r.id)).toEqual(['a', 'b'])
  })
})
