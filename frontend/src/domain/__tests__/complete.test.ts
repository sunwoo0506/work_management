import { describe, expect, it } from 'vitest'
import { completionBlock } from '../complete'

describe('completionBlock', () => {
  it('내가 발의한 일은 그냥 닫힌다', () => {
    expect(completionBlock({ source: '내 발의', reply_body: null })).toBeNull()
  })

  it('요청받은 일은 회신이 없으면 못 닫는다', () => {
    expect(completionBlock({ source: '요청받음', reply_body: null })).not.toBeNull()
  })

  it('대표지시도 마찬가지다', () => {
    expect(completionBlock({ source: '대표지시', reply_body: '' })).not.toBeNull()
  })

  it('공백만 적은 것은 안 적은 것이다', () => {
    expect(completionBlock({ source: '요청받음', reply_body: '   \n  ' })).not.toBeNull()
  })

  it('회신을 적으면 닫힌다', () => {
    expect(completionBlock({ source: '요청받음', reply_body: '8/11 구두 회신' })).toBeNull()
  })
})
