import { describe, expect, it } from 'vitest'
import { dropHallucination, isHallucination } from '../hallucination'

describe('isHallucination — 받아쓰기가 지어낸 말', () => {
  it('★ 실제로 나온 말을 잡는다', () => {
    expect(isHallucination('시청해주셔서 감사합니다.')).toBe(true)
    expect(isHallucination('시청해 주셔서 감사합니다')).toBe(true)
  })

  it('유튜브 자막에 흔한 말들을 잡는다', () => {
    expect(isHallucination('구독과 좋아요 부탁드립니다!')).toBe(true)
    expect(isHallucination('다음 영상에서 만나요~')).toBe(true)
    expect(isHallucination('Thanks for watching')).toBe(true)
  })

  it('방송 마무리 멘트를 잡는다', () => {
    expect(isHallucination('MBC 뉴스 김철수입니다')).toBe(true)
  })

  it('공백·문장부호가 달라도 잡는다', () => {
    expect(isHallucination('  시청해주셔서   감사합니다!!!  ')).toBe(true)
  })

  it('앞에 시각 표시가 붙어 있어도 잡는다', () => {
    expect(isHallucination('[00:42] 시청해주셔서 감사합니다')).toBe(true)
  })

  it('같은 문장을 네 번 넘게 되풀이하면 잡는다', () => {
    expect(isHallucination('네 알겠습니다. 네 알겠습니다. 네 알겠습니다. 네 알겠습니다.')).toBe(true)
  })

  it('★ 사람이 한 말은 안 건드린다 — 이게 제일 중요하다', () => {
    expect(isHallucination('원가 단위를 킬로그램으로 통일하기로 했습니다')).toBe(false)
    expect(isHallucination('대체 거래처 세 곳 견적을 받아 주세요')).toBe(false)
  })

  it('★ 「감사합니다」가 다른 말과 섞여 있으면 사람이 한 말로 본다', () => {
    expect(isHallucination('네 감사합니다. 그러면 다음 주에 뵙겠습니다.')).toBe(false)
    expect(isHallucination('자료 보내 주셔서 감사합니다')).toBe(false)
  })

  it('토막 전체가 「감사합니다」 하나뿐이면 지어낸 것으로 본다', () => {
    expect(isHallucination('감사합니다')).toBe(true)
    expect(isHallucination('수고하셨습니다.')).toBe(true)
  })

  it('세 번 되풀이는 그냥 둔다 — 사람도 그 정도는 한다', () => {
    expect(isHallucination('네. 네. 네.')).toBe(false)
  })

  it('짧은 맞장구가 되풀이되는 것은 안 잡는다 — 실제로 하는 말이다', () => {
    expect(isHallucination('네. 네. 네. 네. 네.')).toBe(false)
  })

  it('빈 글은 지어낸 것이 아니다', () => {
    expect(isHallucination('')).toBe(false)
    expect(isHallucination('   ')).toBe(false)
  })
})

describe('dropHallucination — 털어내기', () => {
  it('지어낸 것이면 빈 문자열', () => {
    expect(dropHallucination('시청해주셔서 감사합니다')).toBe('')
  })

  it('사람이 한 말은 앞뒤 공백만 털고 그대로', () => {
    expect(dropHallucination('  견적 세 곳 받기  ')).toBe('견적 세 곳 받기')
  })
})
