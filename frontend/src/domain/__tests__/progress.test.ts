import { describe, expect, it } from 'vitest'
import { checklistCount, progressFromChecklist } from '../progress'

const items = (...done: boolean[]) => done.map((d) => ({ done: d }))

describe('progressFromChecklist', () => {
  it('체크리스트가 없으면 null — 사람이 정한 값을 건드리지 않는다', () => {
    expect(progressFromChecklist([])).toBeNull()
  })

  it('하나도 안 했으면 0', () => {
    expect(progressFromChecklist(items(false, false, false))).toBe(0)
  })

  it('전부 했으면 100', () => {
    expect(progressFromChecklist(items(true, true))).toBe(100)
  })

  it('반올림한다 — 3분의 1은 33', () => {
    expect(progressFromChecklist(items(true, false, false))).toBe(33)
  })

  it('3분의 2는 67 — 내림이면 66이 되어 합이 안 맞는다', () => {
    expect(progressFromChecklist(items(true, true, false))).toBe(67)
  })

  it('한 개짜리는 0 아니면 100', () => {
    expect(progressFromChecklist(items(false))).toBe(0)
    expect(progressFromChecklist(items(true))).toBe(100)
  })
})

describe('checklistCount', () => {
  it('한 것과 전체를 센다', () => {
    expect(checklistCount(items(true, false, true))).toEqual({ done: 2, total: 3 })
  })

  it('빈 목록은 0 / 0', () => {
    expect(checklistCount([])).toEqual({ done: 0, total: 0 })
  })
})
