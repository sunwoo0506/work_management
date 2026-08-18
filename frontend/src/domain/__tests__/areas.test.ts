import { describe, expect, it } from 'vitest'
import { areaOptions, isRetiredArea } from '../areas'
import { AREAS } from '../types'

describe('areaOptions — 선택지를 만드는 곳은 한 곳뿐이다', () => {
  it('설정에 등록된 것이 있으면 그것만 쓴다', () => {
    expect(areaOptions(['자금', '회계'])).toEqual(['자금', '회계'])
  })

  it('설정이 비어 있으면 코드의 기본 갈래로 버틴다', () => {
    expect(areaOptions([])).toEqual([...AREAS])
    expect(areaOptions(null)).toEqual([...AREAS])
    expect(areaOptions(undefined)).toEqual([...AREAS])
  })

  it('저장된 값이 목록에 없어도 잃지 않는다 — 건드리지도 않았는데 사라지면 안 된다', () => {
    expect(areaOptions(['자금', '회계'], '재고')).toEqual(['자금', '회계', '재고'])
  })

  it('저장된 값이 이미 목록에 있으면 두 번 넣지 않는다', () => {
    expect(areaOptions(['자금', '회계'], '회계')).toEqual(['자금', '회계'])
  })

  it('저장된 값이 없으면 목록을 그대로 둔다', () => {
    expect(areaOptions(['자금'], '')).toEqual(['자금'])
    expect(areaOptions(['자금'], null)).toEqual(['자금'])
    expect(areaOptions(['자금'], '   ')).toEqual(['자금'])
  })

  it('설정이 비어 있을 때도 저장된 값을 지킨다', () => {
    const out = areaOptions([], '예전영역')
    expect(out).toEqual([...AREAS, '예전영역'])
  })

  it('앞뒤 공백을 털고, 겹치면 하나만 남긴다 — 같은 key 가 두 번 나오면 화면이 깨진다', () => {
    expect(areaOptions([' 자금 ', '자금', '', '회계'])).toEqual(['자금', '회계'])
  })

  it('저장된 값의 공백도 털어서 비교한다', () => {
    expect(areaOptions(['자금'], ' 자금 ')).toEqual(['자금'])
  })
})

describe('isRetiredArea — 지워진 영역인지 알려 준다', () => {
  it('설정에서 지워진 값이면 참', () => {
    expect(isRetiredArea(['자금'], '재고')).toBe(true)
  })

  it('목록에 있으면 거짓', () => {
    expect(isRetiredArea(['자금'], '자금')).toBe(false)
  })

  it('저장된 값이 없으면 거짓 — 빈칸에 경고를 붙이지 않는다', () => {
    expect(isRetiredArea(['자금'], '')).toBe(false)
    expect(isRetiredArea(['자금'], null)).toBe(false)
  })

  it('설정이 비어 있으면 기본 갈래를 기준으로 본다', () => {
    expect(isRetiredArea([], '재고')).toBe(false)
    expect(isRetiredArea([], '없는영역')).toBe(true)
  })
})
