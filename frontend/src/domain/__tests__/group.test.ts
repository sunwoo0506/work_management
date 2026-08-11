import { describe, expect, it } from 'vitest'
import { groupByArea } from '../group'

/**
 * 날짜는 로컬 벽시계 리터럴로 만든다 (CLAUDE.md).
 * ISO 문자열은 절대 시각을 고정하는데 구현은 로컬 달력일을 본다.
 */
const TODAY = new Date(2026, 7, 11) // 2026-08-11

type T = {
  id: string
  area: string | null
  status: string
  due_date: string | null
  priority: string
}

const task = (id: string, area: string | null, over: Partial<T> = {}): T => ({
  id,
  area,
  status: '할 일',
  due_date: null,
  priority: 'P1',
  ...over,
})

describe('groupByArea', () => {
  it('영역별로 나눈다', () => {
    const g = groupByArea([task('1', '회생지원'), task('2', '인수인계'), task('3', '회생지원')], TODAY)
    expect(g.map((x) => x.area).sort()).toEqual(['인수인계', '회생지원'])
    expect(g.find((x) => x.area === '회생지원')!.tasks).toHaveLength(2)
  })

  it('영역이 없거나 공백이면 「영역 없음」으로 모인다', () => {
    const g = groupByArea([task('1', null), task('2', '   ')], TODAY)
    expect(g).toHaveLength(1)
    expect(g[0].area).toBe('영역 없음')
    expect(g[0].tasks).toHaveLength(2)
  })

  it('지연·오늘 마감을 센다', () => {
    const g = groupByArea(
      [
        task('1', '재고', { due_date: '2026-08-01' }), // 지연
        task('2', '재고', { due_date: '2026-08-11' }), // 오늘
        task('3', '재고', { due_date: '2026-09-01' }), // 정상
      ],
      TODAY,
    )
    expect(g[0].overdue).toBe(1)
    expect(g[0].dueToday).toBe(1)
    expect(g[0].urgent).toBe(true)
  })

  it('완료·보류는 오늘 마감으로 세지 않는다 — 이미 손을 뗀 일이다', () => {
    const g = groupByArea(
      [
        task('1', '재고', { due_date: '2026-08-11', status: '완료' }),
        task('2', '재고', { due_date: '2026-08-11', status: '보류' }),
      ],
      TODAY,
    )
    expect(g[0].dueToday).toBe(0)
    expect(g[0].urgent).toBe(false)
  })

  it('급한 묶음이 위로 온다 — 가나다순이면 오늘 터질 일이 맨 아래로 간다', () => {
    const g = groupByArea(
      [
        task('1', '가나다', { due_date: '2026-12-01' }), // 급하지 않음
        task('2', '하하하', { due_date: '2026-08-01' }), // 지연
      ],
      TODAY,
    )
    expect(g[0].area).toBe('하하하')
  })

  it('둘 다 급하면 지연이 많은 쪽이 위', () => {
    const g = groupByArea(
      [
        task('1', 'A', { due_date: '2026-08-11' }), // 오늘 1
        task('2', 'B', { due_date: '2026-08-01' }), // 지연 1
        task('3', 'B', { due_date: '2026-08-02' }), // 지연 2
      ],
      TODAY,
    )
    expect(g[0].area).toBe('B')
  })

  it('「영역 없음」은 급하지 않으면 맨 아래 — 이름이 아니라 미분류라는 뜻이다', () => {
    const g = groupByArea([task('1', null), task('2', '회생지원')], TODAY)
    expect(g[g.length - 1].area).toBe('영역 없음')
  })

  it('「영역 없음」에 지연이 있으면 위로 올라온다', () => {
    const g = groupByArea([task('1', null, { due_date: '2026-08-01' }), task('2', '회생지원')], TODAY)
    expect(g[0].area).toBe('영역 없음')
  })

  it('묶음 안쪽은 sortTasks 순서 — 지연이 맨 위', () => {
    const g = groupByArea(
      [
        task('정상', '재고', { due_date: '2026-12-01' }),
        task('지연', '재고', { due_date: '2026-08-01' }),
      ],
      TODAY,
    )
    expect(g[0].tasks.map((t) => t.id)).toEqual(['지연', '정상'])
  })

  it('빈 목록은 빈 배열', () => {
    expect(groupByArea([], TODAY)).toEqual([])
  })
})
