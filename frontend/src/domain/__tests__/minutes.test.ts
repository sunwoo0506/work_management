import { describe, expect, it } from 'vitest'
import {
  EMPTY_MINUTES,
  hasContent,
  mergeMinutes,
  minutesToText,
  parseMinutesDoc,
  splitTranscript,
} from '../minutes'

const 답 = `[목적]
- 자재 단가 인상 통보에 어떻게 대응할지 정한다

[안건]
- 단가 인상 폭 확인
- 대체 거래처 검토

[논의]
- 단가 인상 폭 확인 | 12% 인상 통보를 받음 | 근거 자료를 요청하기로
- 대체 거래처 검토 | 두 곳이 후보 | 견적을 받아 보기로

[결정]
- 이번 달 발주는 기존 단가로 진행한다 | 계약서 조항 근거
- 대체 거래처를 검토한다 |

[할 일]
- 대체 거래처 3곳 견적 받기 | 구매담당 | 8/21
- 단가 인상 공문 회신 | 경영지원 | 8/19

[미결]
- 장기 계약 전환 여부

[다음 회의]
- 8/25 | 견적 비교 결과 검토

[확인 필요]
- 「타이백」으로 들린 대목`

describe('parseMinutesDoc — AI 글을 회의록 양식으로', () => {
  const m = parseMinutesDoc(답)

  it('목적·안건을 나눈다', () => {
    expect(m.purpose).toHaveLength(1)
    expect(m.agenda).toEqual(['단가 인상 폭 확인', '대체 거래처 검토'])
  })

  it('논의는 안건·내용·결과 세 칸으로', () => {
    expect(m.discussions[0]).toEqual({
      topic: '단가 인상 폭 확인',
      points: '12% 인상 통보를 받음',
      result: '근거 자료를 요청하기로',
    })
  })

  it('★ 결정사항과 Action Item 을 따로 담는다', () => {
    expect(m.decisions[0].text).toBe('이번 달 발주는 기존 단가로 진행한다')
    expect(m.decisions[0].note).toBe('계약서 조항 근거')
    expect(m.actions[0]).toEqual({
      text: '대체 거래처 3곳 견적 받기',
      owner: '구매담당',
      due: '8/21',
      status: '예정',
    })
  })

  it('비어 있는 칸은 빈 글로 채운다', () => {
    expect(m.decisions[1].note).toBe('')
  })

  it('다음 회의는 예정일과 안건으로', () => {
    expect(m.next).toEqual({ date: '8/25', agenda: '견적 비교 결과 검토' })
  })

  it('미결·확인 필요도 담는다', () => {
    expect(m.pending).toEqual(['장기 계약 전환 여부'])
    expect(m.checks).toHaveLength(1)
  })

  it('머리표 형식이 달라도 읽는다', () => {
    const x = parseMinutesDoc('## 결정사항\n1. 첫째 결정\n**Action Item**\n- 할 일 | 담당 | 내일')
    expect(x.decisions[0].text).toBe('첫째 결정')
    expect(x.actions[0].owner).toBe('담당')
  })

  it('「없음」은 담지 않는다', () => {
    expect(parseMinutesDoc('[결정]\n없음').decisions).toEqual([])
  })

  it('형식이 통째로 어긋나면 빈 회의록', () => {
    expect(parseMinutesDoc('그냥 줄글입니다')).toEqual(EMPTY_MINUTES)
  })

  it('빈 글에도 죽지 않는다', () => {
    expect(hasContent(parseMinutesDoc(''))).toBe(false)
  })
})

describe('minutesToText — 읽는 글로 내보내기', () => {
  const text = minutesToText(parseMinutesDoc(답), {
    title: '자재 단가 협의',
    metOn: '2026-08-16',
    place: '본사 회의실',
    attendees: '대표, 구매담당',
  })

  it('기본정보가 맨 위에 온다', () => {
    expect(text).toContain('회의명 : 자재 단가 협의')
    expect(text).toContain('참석자 : 대표, 구매담당')
  })

  it('결정사항과 Action Item 이 따로 나온다', () => {
    expect(text).toContain('## 5. 결정사항')
    expect(text).toContain('## 6. Action Item')
    expect(text).toContain('담당 구매담당')
  })

  it('빈 칸은 아예 안 적는다 — 빈 제목만 늘어놓지 않는다', () => {
    const empty = minutesToText(EMPTY_MINUTES, { title: '빈 회의', metOn: '2026-08-16' })
    expect(empty).not.toContain('## 5. 결정사항')
    expect(empty).toContain('회의명 : 빈 회의')
  })
})

describe('splitTranscript — 긴 글을 구간으로', () => {
  it('한도 안이면 그대로 하나', () => {
    expect(splitTranscript('첫 줄\n둘째 줄', 100)).toEqual(['첫 줄\n둘째 줄'])
  })

  it('한도를 넘으면 줄 경계에서 나눈다', () => {
    const 글 = ['가'.repeat(40), '나'.repeat(40), '다'.repeat(40)].join('\n')
    const parts = splitTranscript(글, 90)
    expect(parts).toHaveLength(2)
    // 줄 가운데가 잘리지 않았다
    expect(parts.every((p) => p.split('\n').every((l) => l.length === 40))).toBe(true)
  })

  it('빈 글도 한 조각을 돌려준다', () => {
    expect(splitTranscript('', 100)).toEqual([''])
  })
})

describe('mergeMinutes — 구간별 회의록 합치기', () => {
  const a = parseMinutesDoc(`[목적]
- 단가 인상 대응

[안건]
- 인상 폭 확인

[결정]
- 이번 달은 기존 단가 |

[할 일]
- 견적 받기 | 구매담당 | 8/21`)

  const b = parseMinutesDoc(`[목적]
- 없음

[안건]
- 인상 폭 확인
- 대체 거래처

[결정]
- 이번 달은 기존 단가 |
- 대체 거래처를 검토한다 |

[다음 회의]
- 8/25 | 견적 비교`)

  const m = mergeMinutes([a, b])

  it('겹치는 줄은 한 번만 남긴다', () => {
    expect(m.agenda).toEqual(['인상 폭 확인', '대체 거래처'])
    expect(m.decisions).toHaveLength(2)
  })

  it('목적은 첫 구간 것을 쓴다', () => {
    expect(m.purpose).toEqual(['단가 인상 대응'])
  })

  it('다음 회의는 마지막 구간 것을 쓴다', () => {
    expect(m.next).toEqual({ date: '8/25', agenda: '견적 비교' })
  })

  it('할 일은 그대로 이어 담는다', () => {
    expect(m.actions[0].owner).toBe('구매담당')
  })

  it('구간이 하나면 그대로', () => {
    expect(mergeMinutes([a])).toBe(a)
  })

  it('구간이 없으면 빈 회의록', () => {
    expect(mergeMinutes([])).toEqual(EMPTY_MINUTES)
  })
})
