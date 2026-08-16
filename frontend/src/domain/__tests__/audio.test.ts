import { describe, expect, it } from 'vitest'
import { chunkCount, chunkRanges } from '../audio'

describe('chunkRanges — 긴 소리를 토막으로', () => {
  it('딱 나누어떨어지면 그대로', () => {
    expect(chunkRanges(600, 300)).toEqual([
      { from: 0, to: 300 },
      { from: 300, to: 600 },
    ])
  })

  it('남는 부분도 한 토막이 된다', () => {
    expect(chunkRanges(700, 300)).toEqual([
      { from: 0, to: 300 },
      { from: 300, to: 600 },
      { from: 600, to: 700 },
    ])
  })

  it('마지막이 너무 짧으면 앞에 붙인다', () => {
    // 601초 → 마지막 1초짜리를 따로 보내지 않는다
    expect(chunkRanges(601, 300)).toEqual([
      { from: 0, to: 300 },
      { from: 300, to: 601 },
    ])
  })

  it('토막 하나보다 짧은 소리는 통째로', () => {
    expect(chunkRanges(120, 300)).toEqual([{ from: 0, to: 120 }])
  })

  it('아주 짧아도 한 토막은 나온다 — 붙일 앞 토막이 없다', () => {
    expect(chunkRanges(2, 300)).toEqual([{ from: 0, to: 2 }])
  })

  it('길이가 0이거나 이상하면 빈 목록', () => {
    expect(chunkRanges(0, 300)).toEqual([])
    expect(chunkRanges(-5, 300)).toEqual([])
    expect(chunkRanges(600, 0)).toEqual([])
  })

  it('개수를 미리 셀 수 있다', () => {
    expect(chunkCount(3600, 300)).toBe(12)
  })
})
