import { describe, expect, it } from 'vitest'
import { checklistCount, progressFromChecklist, resolveProgress } from '../progress'

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

describe('resolveProgress — 근거가 셋일 때 하나를 고른다', () => {
  const child = (progress: number, status = '진행중') => ({ progress, status })

  it('아무것도 없으면 사람이 정한 값', () => {
    const r = resolveProgress({ children: [], checklist: [], manual: 40 })
    expect(r).toEqual({ pct: 40, from: '손으로', note: '손으로 정한 값' })
  })

  it('체크리스트가 있으면 사람이 정한 값을 이긴다', () => {
    const r = resolveProgress({ children: [], checklist: items(true, false), manual: 90 })
    expect(r.pct).toBe(50)
    expect(r.from).toBe('체크리스트')
    expect(r.note).toBe('체크리스트 1 / 2')
  })

  it('체크리스트가 하위 업무를 이긴다 — 체크리스트가 늘 전체 그림이다', () => {
    // 체크 항목 하나를 「업무로 올려도」 그 줄은 체크리스트에 남는다.
    // 하위 업무를 위에 두면 다섯 중 하나만 올린 순간 나머지 넷이 계산에서 사라진다
    const r = resolveProgress({
      children: [child(0)],
      checklist: items(true, true, true, false),
      manual: 10,
    })
    expect(r.from).toBe('체크리스트')
    expect(r.pct).toBe(75)
  })

  it('체크리스트가 없을 때만 하위 업무로 센다', () => {
    const r = resolveProgress({
      children: [child(0), child(100, '완료')],
      checklist: [],
      manual: 10,
    })
    expect(r.from).toBe('하위업무')
    expect(r.pct).toBe(50)
  })

  it('하위 업무는 평균이다 — 완료 개수로 세면 다 90%인데 0%가 된다', () => {
    const r = resolveProgress({
      children: [child(90), child(90), child(90)],
      checklist: [],
      manual: 0,
    })
    expect(r.pct).toBe(90)
    expect(r.note).toBe('묶인 업무 0 / 3 완료')
  })

  it('「완료」로 닫힌 하위는 진행률이 낮아도 100으로 센다', () => {
    // 체크리스트를 다 안 채우고 닫는 일은 흔하다.
    // 그걸 그대로 넣으면 다 끝난 부모가 영원히 80%에 머문다
    const r = resolveProgress({
      children: [child(60, '완료'), child(60, '완료')],
      checklist: [],
      manual: 0,
    })
    expect(r.pct).toBe(100)
    expect(r.note).toBe('묶인 업무 2 / 2 완료')
  })

  it('보류는 특별 취급하지 않는다 — 멈춰 있어도 한 일은 한 일이다', () => {
    const r = resolveProgress({
      children: [child(40, '보류'), child(60)],
      checklist: [],
      manual: 0,
    })
    expect(r.pct).toBe(50)
  })

  it('반올림한다', () => {
    const r = resolveProgress({ children: [child(0), child(0), child(100)], checklist: [], manual: 0 })
    expect(r.pct).toBe(33)
  })
})
