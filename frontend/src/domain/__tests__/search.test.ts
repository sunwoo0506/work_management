import { describe, expect, it } from 'vitest'
import { filterTasks, matchTask } from '../search'

const task = (over: Record<string, unknown> = {}) => ({
  title: '분기 단가표 갱신',
  detail: '구매사업본부 요청. 신규 품목 단가를 채운다.',
  notes: null,
  reply_body: null,
  area: '품목·가격',
  requester: null,
  ...over,
})

describe('matchTask', () => {
  it('제목에서 걸린다', () => {
    expect(matchTask(task(), '단가표')).toEqual([{ field: '제목', snippet: '분기 단가표 갱신' }])
  })

  it('상세에서도 걸린다 — 제목에 없는 말로 찾을 수 있어야 한다', () => {
    const hits = matchTask(task(), '구매사업본부')
    expect(hits?.map((h) => h.field)).toEqual(['상세'])
  })

  it('영역으로도 걸린다', () => {
    expect(matchTask(task(), '품목')).not.toBeNull()
  })

  it('대소문자를 가리지 않는다', () => {
    expect(matchTask(task({ title: 'ERP 단가 정리' }), 'erp')).not.toBeNull()
  })

  it('낱말이 여럿이면 전부 있어야 한다', () => {
    expect(matchTask(task(), '단가 갱신')).not.toBeNull()
    expect(matchTask(task(), '단가 회생')).toBeNull()
  })

  it('낱말이 서로 다른 칸에 있어도 된다', () => {
    // 「분기」는 제목에, 「신규」는 상세에
    const hits = matchTask(task(), '분기 신규')
    expect(hits?.map((h) => h.field).sort()).toEqual(['상세', '제목'])
  })

  it('한 칸에서 여러 낱말이 걸려도 그 칸은 한 번만 나온다', () => {
    const hits = matchTask(task(), '분기 단가표')
    expect(hits).toHaveLength(1)
    expect(hits![0].field).toBe('제목')
  })

  it('비어 있는 칸은 건너뛴다 — null 이 들어와도 죽지 않는다', () => {
    expect(matchTask(task({ detail: null, area: null }), '단가표')).not.toBeNull()
  })

  it('검색어가 비면 null — 「전부 통과」는 부르는 쪽이 판단한다', () => {
    expect(matchTask(task(), '')).toBeNull()
    expect(matchTask(task(), '   ')).toBeNull()
  })

  it('긴 글은 걸린 자리 앞뒤만 떼어 온다', () => {
    const long = `${'가'.repeat(200)}회생계획안${'나'.repeat(200)}`
    const hits = matchTask(task({ detail: long }), '회생계획안')
    expect(hits![0].snippet).toContain('회생계획안')
    expect(hits![0].snippet.length).toBeLessThan(80)
    expect(hits![0].snippet.startsWith('…')).toBe(true)
    expect(hits![0].snippet.endsWith('…')).toBe(true)
  })
})

describe('filterTasks', () => {
  it('검색어가 비면 전부 통과시킨다', () => {
    const rows = [task(), task({ title: '다른 일' })]
    expect(filterTasks(rows, '')).toHaveLength(2)
  })

  it('걸리는 것만 남긴다', () => {
    const rows = [task(), task({ title: '회생 자료 정리', detail: null, area: '회생지원' })]
    const out = filterTasks(rows, '회생')
    expect(out).toHaveLength(1)
    expect(out[0].task.title).toBe('회생 자료 정리')
  })

  it('걸린 자리를 같이 돌려준다 — 왜 검색됐는지 보여야 믿는다', () => {
    const out = filterTasks([task()], '구매사업본부')
    expect(out[0].hits[0].field).toBe('상세')
  })
})
