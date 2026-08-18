import { describe, expect, it } from 'vitest'
import { dropHallucination, isHallucination, keepSpoken } from '../hallucination'

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

/*
  2026-08-19 — 실제 회의록에 「독도는 범죄로 지치고 바나나도 의지」 같은
  처음 보는 헛소리가 들어왔다. 낱말 목록으로는 못 잡는다.
  받아쓰기가 스스로 주는 확신도를 보고 거른다.
*/
describe('keepSpoken — 숫자를 보고 거른다', () => {
  const 말 = (text: string, noSpeechProb: number, avgLogprob = -0.3, compressionRatio = 1.2) => ({
    text,
    noSpeechProb,
    avgLogprob,
    compressionRatio,
  })

  it('★ 말없음 확률이 높은 토막을 버린다 — 실제로 잰 값(0.802)이다', () => {
    expect(keepSpoken('시청해주셔서 감사합니다.', [말('시청해주셔서 감사합니다.', 0.802, -0.679)])).toBe('')
  })

  it('★ 사람 말은 남긴다 — 실제로 잰 값(0.008)이다', () => {
    const 실제 = '원가 단위를 킬로그램으로 통일하기로 했습니다.'
    expect(keepSpoken(실제, [말(실제, 0.008, -0.267)])).toBe(실제)
  })

  it('★ 목록에 없는 헛소리도 잡는다 — 이게 낱말 목록과 다른 점이다', () => {
    const 헛소리 = '독도는 범죄로 지치고 바나나도 의지 이런 짓을 했어?'
    expect(keepSpoken(헛소리, [말(헛소리, 0.91, -0.9)])).toBe('')
  })

  it('한 토막만 버리고 나머지는 남긴다', () => {
    const out = keepSpoken('무시됨', [
      말('원가 단위를 통일합니다.', 0.01),
      말('시청해주셔서 감사합니다.', 0.85),
      말('견적을 받아 주세요.', 0.02),
    ])
    expect(out).toBe('원가 단위를 통일합니다. 견적을 받아 주세요.')
  })

  it('확신도가 바닥일 때만 버린다 — 어중간하면 사람 말이 날아간다', () => {
    expect(keepSpoken('x', [말('알아들을 수 없는 말', 0.1, -1.5)])).toBe('')
    expect(keepSpoken('보통 말입니다', [말('보통 말입니다', 0.1, -0.7)])).toBe('보통 말입니다')
  })

  it('같은 말을 계속 뱉으면 버린다', () => {
    expect(keepSpoken('x', [말('네 네 네 네', 0.1, -0.3, 3.0)])).toBe('')
  })

  it('★ 숫자를 못 받았으면 버리지 않는다 — 모른다고 지우면 안 된다', () => {
    const 말없음 = { text: '중요한 회의 내용입니다', noSpeechProb: null, avgLogprob: null, compressionRatio: null }
    expect(keepSpoken('중요한 회의 내용입니다', [말없음])).toBe('중요한 회의 내용입니다')
  })

  it('토막이 아예 없으면 전체 글을 낱말 목록으로만 거른다 — 옛 판 서버 대비', () => {
    expect(keepSpoken('시청해주셔서 감사합니다', [])).toBe('')
    expect(keepSpoken('원가 단위를 통일합니다', null)).toBe('원가 단위를 통일합니다')
    expect(keepSpoken('원가 단위를 통일합니다', undefined)).toBe('원가 단위를 통일합니다')
  })

  it('숫자는 통과했는데 아는 문구면 마지막 체에서 걸린다', () => {
    expect(keepSpoken('x', [말('오늘 영상은 여기까지입니다. 감사합니다.', 0.1)])).toBe('')
  })

  it('전부 버려지면 빈 문자열', () => {
    expect(keepSpoken('x', [말('가', 0.9), 말('나', 0.9)])).toBe('')
  })
})
