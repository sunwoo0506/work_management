import { describe, it, expect } from 'vitest'
import { toTaskInsert } from '../promote'

const item = {
  id: 'i1',
  company_id: 'c1',
  user_id: 'u1',
  content: '품목구분 0/1 의미 — 권훈에게 확인',
  tag: '확인필요',
  origin: '직접' as const,
}

describe('toTaskInsert', () => {
  it('인박스 내용이 업무 제목이 된다', () => {
    const r = toTaskInsert(item, { priority: 'P0', due_date: '2026-08-20', area: '품목·가격' })
    expect(r.title).toBe('품목구분 0/1 의미 — 권훈에게 확인')
  })

  it('출처는 인박스로 고정된다', () => {
    const r = toTaskInsert(item, { priority: 'P1', due_date: null, area: null })
    expect(r.source).toBe('인박스')
  })

  it('user_id와 company_id를 그대로 옮긴다', () => {
    const r = toTaskInsert(item, { priority: 'P1', due_date: null, area: null })
    expect(r.user_id).toBe('u1')
    expect(r.company_id).toBe('c1')
  })

  it('선택한 값이 반영된다', () => {
    const r = toTaskInsert(item, { priority: 'P0', due_date: '2026-08-20', area: '재고' })
    expect(r.priority).toBe('P0')
    expect(r.due_date).toBe('2026-08-20')
    expect(r.area).toBe('재고')
  })

  it('상태는 할 일로 시작한다', () => {
    const r = toTaskInsert(item, { priority: 'P1', due_date: null, area: null })
    expect(r.status).toBe('할 일')
    expect(r.progress).toBe(0)
  })

  it('제목이 60자를 넘으면 자르고 전문은 detail에 남긴다', () => {
    const long = 'ㄱ'.repeat(80)
    const r = toTaskInsert({ ...item, content: long }, { priority: 'P1', due_date: null, area: null })
    expect(r.title).toHaveLength(60)
    expect(r.detail).toBe(long)
  })

  it('짧으면 detail은 비운다', () => {
    const r = toTaskInsert(item, { priority: 'P1', due_date: null, area: null })
    expect(r.detail).toBeNull()
  })
})

describe('업무 영역 — 회의록 분류가 따라온다', () => {
  const item = {
    id: 'I1',
    user_id: 'U1',
    company_id: 'C1',
    content: '대체 거래처 3곳 견적 받기 · 담당 구매담당 · 기한 8/21',
    tag: '구매',
    origin: '회의록',
  }

  it('사람이 영역을 안 골랐으면 인박스 태그를 쓴다', () => {
    const row = toTaskInsert(item, { priority: 'P2', due_date: null, area: null })
    expect(row.area).toBe('구매')
  })

  it('사람이 고른 영역이 태그보다 우선한다', () => {
    const row = toTaskInsert(item, { priority: 'P2', due_date: null, area: '자금' })
    expect(row.area).toBe('자금')
  })

  it('태그도 선택도 없으면 비어 있다', () => {
    const row = toTaskInsert({ ...item, tag: null }, { priority: 'P2', due_date: null, area: null })
    expect(row.area).toBeNull()
  })
})
