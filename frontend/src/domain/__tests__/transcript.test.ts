import { describe, expect, it } from 'vitest'
import {
  appendFinal,
  clock,
  editSegment,
  parseMinutes,
  toggleMark,
  transcriptStats,
  transcriptText,
  usedGlossary,
} from '../transcript'
import type { Segment } from '../transcript'

const 초 = (n: number) => n * 1000
const 분 = (n: number) => n * 60_000

describe('clock — 흐른 시간 표시', () => {
  it('한 자리 초를 0으로 채운다', () => {
    expect(clock(초(7))).toBe('00:07')
  })

  it('한 시간을 넘으면 시:분:초', () => {
    expect(clock(분(62) + 초(5))).toBe('1:02:05')
  })

  it('음수는 00:00 으로 막는다', () => {
    expect(clock(-500)).toBe('00:00')
  })
})

describe('appendFinal — 들린 말 쌓기', () => {
  it('빈 말은 버린다', () => {
    expect(appendFinal([], '   ', 0)).toEqual([])
  })

  it('짧은 간격으로 이어진 토막은 한 줄로 합친다', () => {
    let s: Segment[] = appendFinal([], '오늘 회의는', 초(3))
    s = appendFinal(s, '자재 단가 건입니다', 초(6))
    expect(s).toHaveLength(1)
    expect(s[0].text).toBe('오늘 회의는 자재 단가 건입니다')
    // 합쳐도 시각은 처음 말한 때를 지킨다
    expect(s[0].at).toBe(초(3))
  })

  it('오래 비면 새 줄로 뗀다', () => {
    let s: Segment[] = appendFinal([], '앞 이야기', 초(3))
    s = appendFinal(s, '한참 뒤 이야기', 초(30))
    expect(s).toHaveLength(2)
  })

  it('같은 말이 다시 와도 두 번 적지 않는다', () => {
    let s: Segment[] = appendFinal([], '단가를 다시 받기로 했습니다', 초(3))
    s = appendFinal(s, '단가를 다시 받기로 했습니다', 초(4))
    expect(s).toHaveLength(1)
  })

  it('「중요」로 찍은 줄에는 이어 붙이지 않는다', () => {
    let s: Segment[] = appendFinal([], '이건 중요한 말', 초(3))
    s = toggleMark(s, 0)
    s = appendFinal(s, '그 다음 말', 초(5))
    expect(s).toHaveLength(2)
    expect(s[0].mark).toBe(true)
  })

  it('한 줄이 너무 길어지면 뗀다', () => {
    const 긴말 = '가'.repeat(150)
    let s: Segment[] = appendFinal([], 긴말, 초(3))
    s = appendFinal(s, '나'.repeat(30), 초(5))
    expect(s).toHaveLength(2)
  })
})

describe('toggleMark', () => {
  it('켜고 끈다', () => {
    const s0 = appendFinal([], '말', 0)
    expect(toggleMark(s0, 0)[0].mark).toBe(true)
    expect(toggleMark(toggleMark(s0, 0), 0)[0].mark).toBe(false)
  })

  it('없는 자리를 눌러도 죽지 않는다', () => {
    expect(toggleMark([], 3)).toEqual([])
  })
})

describe('editSegment — 잘못 들린 줄 고치기', () => {
  const base = appendFinal(appendFinal([], '타이백 발주', 0), '다음 주 납품', 분(1))

  it('내용을 바꾼다', () => {
    expect(editSegment(base, 0, '타이벡 발주')[0].text).toBe('타이벡 발주')
  })

  it('비우면 그 줄을 지운다', () => {
    expect(editSegment(base, 0, '  ')).toHaveLength(1)
  })

  it('시각은 그대로 둔다', () => {
    expect(editSegment(base, 1, '다음 주 목요일 납품')[1].at).toBe(분(1))
  })
})

describe('transcriptText / transcriptStats', () => {
  const s = toggleMark(appendFinal(appendFinal([], '첫 줄', 초(5)), '둘째 줄', 분(2)), 1)

  it('시각을 앞에 달고, 중요 줄에는 ★ 를 붙인다', () => {
    expect(transcriptText(s)).toBe('[00:05] 첫 줄\n[02:00] ★ 둘째 줄')
  })

  it('줄 수와 글자 수를 센다', () => {
    // 「첫 줄」 3자 + 「둘째 줄」 4자. 시각·★ 는 사람이 적은 말이 아니라 세지 않는다
    expect(transcriptStats(s)).toEqual({ lines: 2, chars: 7 })
  })

  it('빈 회의는 빈 글', () => {
    expect(transcriptText([])).toBe('')
  })
})

describe('usedGlossary — 이번 회의에 나온 용어만', () => {
  const 용어집 = [
    { term: '타이벡', means: '방수 시트 상표명' },
    { term: 'LC', means: '신용장' },
    { term: '이카운트', means: '재고 프로그램' },
  ]

  it('나온 것만 고른다', () => {
    const 뽑힘 = usedGlossary('타이벡 단가와 LC 개설 이야기', 용어집)
    expect(뽑힘.map((g) => g.term)).toEqual(['타이벡', 'LC'])
  })

  it('대소문자를 가리지 않는다', () => {
    expect(usedGlossary('lc 개설', 용어집).map((g) => g.term)).toEqual(['LC'])
  })

  it('빈 용어는 아무 글에나 걸리지 않는다', () => {
    expect(usedGlossary('아무 말', [{ term: '  ', means: '빈 것' }])).toEqual([])
  })
})

describe('parseMinutes — AI 초안을 칸으로 나누기', () => {
  const 답 = `[요약]
- 자재 단가 인상 통보를 받았습니다
- 대체 거래처를 알아보기로 했습니다

[결정]
- 이번 달 발주는 기존 단가로 진행합니다

[할 일]
- 대체 거래처 3곳 견적 받기
- 단가 인상 공문 회신

[확인 필요]
- 「타이백」으로 들린 대목 — 「타이벡」이 맞는지`

  it('네 칸으로 나눈다', () => {
    const m = parseMinutes(답)
    expect(m.summary).toHaveLength(2)
    expect(m.decisions).toEqual(['이번 달 발주는 기존 단가로 진행합니다'])
    expect(m.followUps).toEqual(['대체 거래처 3곳 견적 받기', '단가 인상 공문 회신'])
    expect(m.checks).toHaveLength(1)
  })

  it('머리표 형식이 달라도 읽는다', () => {
    const m = parseMinutes('## 요약\n1. 첫째\n**결정**\n· 둘째')
    expect(m.summary).toEqual(['첫째'])
    expect(m.decisions).toEqual(['둘째'])
  })

  it('「없음」은 항목으로 담지 않는다', () => {
    expect(parseMinutes('[결정]\n없음').decisions).toEqual([])
  })

  it('칸 이름이 하나도 없으면 빈 칸을 돌려준다 (화면이 원문을 보여 준다)', () => {
    const m = parseMinutes('그냥 줄글로 답한 경우입니다')
    expect(m).toEqual({ summary: [], decisions: [], followUps: [], checks: [] })
  })

  it('빈 답에도 죽지 않는다', () => {
    expect(parseMinutes('').summary).toEqual([])
  })
})
