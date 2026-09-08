import { describe, expect, it } from 'vitest'
import {
  EMPTY_MINUTES,
  attendeesToConfirms,
  decisionsOf,
  draftView,
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

[안건별]
- 단가 인상 폭 확인 | 12% 인상 통보를 받음 | 근거 자료가 없어 확인이 필요 | 이번 달 발주는 기존 단가로 진행한다 | 근거 자료 요청 | 자금
- 대체 거래처 검토 | 현재 한 곳에만 발주 중 | 후보 두 곳을 검토 | 대체 거래처를 검토한다 | 견적 3곳 비교 | 구매

[조치사항]
- 대체 거래처 3곳 견적 받기 | 구매담당 | 8/21 | 자료 수령 대기 | 구매
- 단가 인상 공문 회신 | 경영지원 | 8/19 | | 총무

[미결]
- 장기 계약 전환 여부

[다음 점검]
- 견적 비교 결과
- 기존 계약 해지 조건

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

  it('★ 안건은 현재상황·논의내용·결론·조치사항 네 칸으로 묶인다', () => {
    expect(m.items[0]).toEqual({
      title: '단가 인상 폭 확인',
      situation: '12% 인상 통보를 받음',
      discussion: '근거 자료가 없어 확인이 필요',
      conclusion: '이번 달 발주는 기존 단가로 진행한다',
      action: '근거 자료 요청',
      area: '자금',
    })
  })

  it('★ 결론과 조치사항을 가른다', () => {
    expect(decisionsOf(m).map((d) => d.text)).toEqual([
      '이번 달 발주는 기존 단가로 진행한다',
      '대체 거래처를 검토한다',
    ])
    expect(m.actions[0]).toEqual({
      text: '대체 거래처 3곳 견적 받기',
      owner: '구매담당',
      due: '8/21',
      note: '자료 수령 대기',
      status: '예정',
      area: '구매',
    })
  })

  it('비어 있는 칸은 빈 글로 채운다', () => {
    expect(m.actions[1].note).toBe('')
  })

  it('★ 분류(업무영역)를 맨 뒤 칸에서 읽는다', () => {
    expect(m.items[0].area).toBe('자금')
    expect(m.actions[1].area).toBe('총무')
  })

  it('비고 칸이 없는 3칸짜리도 읽는다', () => {
    const old = parseMinutesDoc('[조치사항]\n- 견적 받기 | 담당자 | 내일')
    expect(old.actions[0]).toEqual({
      text: '견적 받기',
      owner: '담당자',
      due: '내일',
      note: '',
      status: '예정',
      area: '',
    })
  })

  it('다음 회의는 예정일과 안건으로', () => {
    expect(m.next).toEqual({ date: '8/25', agenda: '견적 비교 결과 검토' })
  })

  it('다음 회의 주요 점검 사항을 따로 담는다', () => {
    expect(m.nextChecks).toEqual(['견적 비교 결과', '기존 계약 해지 조건'])
  })

  it('미결·확인 필요도 담는다', () => {
    expect(m.pending).toEqual(['장기 계약 전환 여부'])
    expect(m.checks).toHaveLength(1)
  })

  it('머리표 형식이 달라도 읽는다', () => {
    const x = parseMinutesDoc('## 안건별\n1. 가 | 나 | 다 | 라 | 마\n**조치사항**\n- 할 일 | 담당 | 내일')
    expect(x.items[0].conclusion).toBe('라')
    expect(x.actions[0].owner).toBe('담당')
  })

  it('「안건1.」 같은 번호 머리를 뗀다', () => {
    const x = parseMinutesDoc('[안건별]\n- 안건1. 보정서 확인 | 가 | 나 | 다 | 라')
    expect(x.items[0].title).toBe('보정서 확인')
  })

  it('「없음」은 담지 않는다', () => {
    expect(parseMinutesDoc('[안건별]\n없음').items).toEqual([])
  })

  it('형식이 통째로 어긋나면 빈 회의록', () => {
    expect(parseMinutesDoc('그냥 줄글입니다')).toEqual(EMPTY_MINUTES)
  })

  it('빈 글에도 죽지 않는다', () => {
    expect(hasContent(parseMinutesDoc(''))).toBe(false)
  })
})

/*
  프롬프트를 바꿔도 모델은 옛 버릇대로 답할 때가 있다.
  그때 통째로 잃는 것보다 읽을 수 있는 만큼 읽는 편이 낫다.
*/
describe('옛 형식(안건 | 논의 | 결과)도 읽는다', () => {
  const m = parseMinutesDoc('[논의]\n- 단가 확인 | 12% 인상 | 자료 요청하기로 | 구매')

  it('세 칸짜리를 안건 카드로 옮겨 담는다', () => {
    expect(m.items[0]).toEqual({
      title: '단가 확인',
      situation: '',
      discussion: '12% 인상',
      conclusion: '자료 요청하기로',
      area: '구매',
      action: '',
    })
  })
})

describe('minutesToText — 읽는 글로 내보내기', () => {
  const text = minutesToText(parseMinutesDoc(답), {
    title: '자재 단가 협의',
    metOn: '2026-08-16',
    place: '본사 회의실',
    attendees: '대표, 구매담당',
    writer: '경영지원',
  })

  it('기본정보가 맨 위에 온다', () => {
    expect(text).toContain('회의명 : 자재 단가 협의')
    expect(text).toContain('참 석 : 대표, 구매담당')
    expect(text).toContain('작성자 : 경영지원')
  })

  it('안건별 네 칸이 이름표와 함께 나온다', () => {
    expect(text).toContain('안건1. 단가 인상 폭 확인')
    expect(text).toContain('■ 현재상황')
    expect(text).toContain('■ 결론')
  })

  it('조치사항은 담당·마감·비고가 붙는다', () => {
    expect(text).toContain('## 4. 조치사항 정리')
    expect(text).toContain('담당 구매담당')
    expect(text).toContain('비고 자료 수령 대기')
  })

  it('분류가 대괄호로 붙는다', () => {
    expect(text).toContain('[자금]')
    expect(text).toContain('[구매]')
  })

  it('빈 칸은 아예 안 적는다 — 빈 제목만 늘어놓지 않는다', () => {
    const empty = minutesToText(EMPTY_MINUTES, { title: '빈 회의', metOn: '2026-08-16' })
    expect(empty).not.toContain('## 4. 조치사항 정리')
    expect(empty).toContain('회의명 : 빈 회의')
  })

  it('참석자 확인란은 확인 여부까지 적는다', () => {
    const withConfirm = minutesToText(
      { ...parseMinutesDoc(답), confirms: [{ name: '대표', confirmed: true }, { name: '구매담당', confirmed: false }] },
      { title: '자재 단가 협의', metOn: '2026-08-16' },
    )
    expect(withConfirm).toContain('대표(확인), 구매담당(미확인)')
    expect(withConfirm).toContain('3영업일')
  })
})

describe('attendeesToConfirms — 참석자를 확인란으로', () => {
  it('쉼표·가운뎃점·줄바꿈으로 나눈다', () => {
    expect(attendeesToConfirms('대표, 경영지원 · 구매담당')).toEqual([
      { name: '대표', confirmed: false },
      { name: '경영지원', confirmed: false },
      { name: '구매담당', confirmed: false },
    ])
  })

  it('★ 이미 받아 둔 확인은 지킨다 — 참석자를 고쳤다고 날아가면 안 된다', () => {
    const prev = [{ name: '대표', confirmed: true }]
    expect(attendeesToConfirms('대표, 구매담당', prev)).toEqual([
      { name: '대표', confirmed: true },
      { name: '구매담당', confirmed: false },
    ])
  })

  it('빈 값이면 빈 목록', () => {
    expect(attendeesToConfirms(null)).toEqual([])
  })
})

describe('draftView — 회의 직후 훑어보는 네 칸', () => {
  const v = draftView(parseMinutesDoc(답))

  it('안건·결론·조치사항을 뽑아 준다', () => {
    expect(v.summary).toEqual(['단가 인상 폭 확인', '대체 거래처 검토'])
    expect(v.decisions).toHaveLength(2)
    expect(v.followUps[0]).toBe('대체 거래처 3곳 견적 받기')
  })

  it('안건 목록이 없으면 안건 카드 제목으로 채운다', () => {
    const only = parseMinutesDoc('[안건별]\n- 보정서 확인 | 가 | 나 | 다 | 라')
    expect(draftView(only).summary).toEqual(['보정서 확인'])
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

[안건별]
- 인상 폭 확인 | 12% 통보 | 근거 확인 필요 | |

[조치사항]
- 견적 받기 | 구매담당 | 8/21`)

  const b = parseMinutesDoc(`[목적]
- 없음

[안건]
- 인상 폭 확인
- 대체 거래처

[안건별]
- 인상 폭 확인 | | 자료를 받아 보기로 | 이번 달은 기존 단가 | 자료 요청
- 대체 거래처 | 한 곳뿐 | 후보 검토 | 대체 거래처를 검토한다 | 견적

[다음 점검]
- 견적 비교 결과

[다음 회의]
- 8/25 | 견적 비교`)

  const m = mergeMinutes([a, b])

  it('겹치는 줄은 한 번만 남긴다', () => {
    expect(m.agenda).toEqual(['인상 폭 확인', '대체 거래처'])
  })

  /*
    2026-09-08 부터 「 / 」가 아니라 **줄바꿈**으로 잇는다.
    안건의 칸이 한 줄에서 여러 줄로 바뀌었기 때문이다 — 논의내용에 숫자·산출근거·
    버린 안이 줄줄이 들어간다. 슬래시로 이으면 앞 구간의 열 줄과 뒷 구간의 열 줄이
    한 문단으로 뭉개져 읽을 수 없다.
  */
  it('★ 구간에 걸친 같은 안건은 칸끼리 이어 붙인다', () => {
    expect(m.items).toHaveLength(2)
    expect(m.items[0].situation).toBe('12% 통보')
    expect(m.items[0].discussion).toBe('근거 확인 필요\n자료를 받아 보기로')
    expect(m.items[0].conclusion).toBe('이번 달은 기존 단가')
  })

  it('목적은 첫 구간 것을 쓴다', () => {
    expect(m.purpose).toEqual(['단가 인상 대응'])
  })

  it('다음 회의는 마지막 구간 것을 쓴다', () => {
    expect(m.next).toEqual({ date: '8/25', agenda: '견적 비교' })
    expect(m.nextChecks).toEqual(['견적 비교 결과'])
  })

  it('조치사항은 그대로 이어 담는다', () => {
    expect(m.actions[0].owner).toBe('구매담당')
  })

  it('구간이 하나면 그대로', () => {
    expect(mergeMinutes([a])).toBe(a)
  })

  it('구간이 없으면 빈 회의록', () => {
    expect(mergeMinutes([])).toEqual(EMPTY_MINUTES)
  })
})

/*
  2026-08-18 — AI 를 실제로 한 번 돌려 보고 나서 붙인 시험들.
  글로만 확인했으면 못 봤을 것들이다.
*/
describe('AI 가 줄 끝에 붙인 근거 표기 — 칸을 오염시키지 않는다', () => {
  it('분류 칸의 근거 표기를 떼어 낸다', () => {
    const m = parseMinutesDoc(
      '[안건별]\n- 원가 단위 | 제각각 | 통일하자는 의견 | 킬로그램으로 통일 | 공지 | 원가·단위 ([받아쓴 글 00:20~00:52])',
    )
    expect(m.items[0].area).toBe('원가·단위')
  })

  it('근거가 여럿 적힌 것도 떼어 낸다', () => {
    const m = parseMinutesDoc(
      '[안건별]\n- 타이벡 단가 | 인상됨 | 추가 확인 | | | 품목·가격 ([사내 용어집], [받아쓴 글 01:36~02:22])',
    )
    expect(m.items[0].area).toBe('품목·가격')
  })

  it('기한 칸에 붙은 근거도 뗀다 — 여기가 더러우면 기한을 못 읽는다', () => {
    const m = parseMinutesDoc('[조치사항]\n- 견적 받기 | 담당자 | 다음 주 수요일 ([받아쓴 글 02:15])')
    expect(m.actions[0].due).toBe('다음 주 수요일')
  })

  it('자유 서술 칸에서도 뗀다', () => {
    const m = parseMinutesDoc('[미결]\n- 기존 데이터 처리 방법 ([받아쓴 글 01:03~01:24])')
    expect(m.pending[0]).toBe('기존 데이터 처리 방법')
  })

  it('★ 내용인 괄호는 건드리지 않는다 — 「(수요일까지)」는 사람이 한 말이다', () => {
    const m = parseMinutesDoc('[조치사항]\n- 대체 거래처 견적 (3곳) | 담당자 | 수요일')
    expect(m.actions[0].text).toBe('대체 거래처 견적 (3곳)')
    expect(m.actions[0].due).toBe('수요일')
  })
})

describe('분류 거르기 — 목록에 없으면 비운다', () => {
  const AREAS = ['원가·단위', '품목·가격', '회생지원']

  it('목록 안의 값은 그대로 받는다', () => {
    const m = parseMinutesDoc('[안건별]\n- 통일 | 가 | 나 | 다 | 라 | 원가·단위', AREAS)
    expect(m.items[0].area).toBe('원가·단위')
  })

  it('★ 지어낸 분류는 비운다 — 틀리게 채우는 것보다 비는 게 낫다', () => {
    const m = parseMinutesDoc('[안건별]\n- 정수기 | 가 | 나 | 다 | 라 | 총무·시설', AREAS)
    expect(m.items[0].area).toBe('')
  })

  it('근거를 뗀 뒤에 거른다 — 표기가 붙었다고 멀쩡한 분류를 버리지 않는다', () => {
    const m = parseMinutesDoc(
      '[조치사항]\n- 견적 | 담당 | 수요일 | 대기 | 품목·가격 ([받아쓴 글 02:15])',
      AREAS,
    )
    expect(m.actions[0].area).toBe('품목·가격')
  })

  it('목록을 안 넘기면 거르지 않는다 — 설정이 비었을 때 값을 잃지 않는다', () => {
    const m = parseMinutesDoc('[안건별]\n- 통일 | | | | | 아무거나')
    expect(m.items[0].area).toBe('아무거나')
    expect(parseMinutesDoc('[안건별]\n- 통일 | | | | | 아무거나', []).items[0].area).toBe('아무거나')
  })

  /*
    옛 형식의 네 번째 칸은 분류였고 새 서식은 비고다.
    등록된 영역이면 분류로, 아니면 비고로 읽는다 —
    비고는 틀려도 눈에 보이지만 분류가 틀리면 리포트 집계가 조용히 어긋난다.
  */
  it('조치사항 4칸 — 등록된 영역이면 분류로 읽는다', () => {
    const m = parseMinutesDoc('[조치사항]\n- 견적 | 담당 | 수요일 | 품목·가격', AREAS)
    expect(m.actions[0].area).toBe('품목·가격')
    expect(m.actions[0].note).toBe('')
  })

  it('조치사항 4칸 — 영역 목록에 없으면 비고로 읽는다', () => {
    const m = parseMinutesDoc('[조치사항]\n- 견적 | 담당 | 수요일 | 자료 수령 대기', AREAS)
    expect(m.actions[0].note).toBe('자료 수령 대기')
    expect(m.actions[0].area).toBe('')
  })
})

/* ══════════════════════════════════════════════════════════
   안건 블록 (2026-09-08)
   ══════════════════════════════════════════════════════════
   전에는 안건 하나가 세로줄로 나눈 **한 줄**이었다. 그래서 「품목 3개 ×
   단가 × 산출근거」 같은 논의를 담을 자리가 물리적으로 없었고, 담기지 못한
   것이 그냥 사라졌다 — 회의록이 얇았던 가장 큰 이유다.
   ══════════════════════════════════════════════════════════ */
describe('안건 블록 — 안건 하나가 여러 줄이다', () => {
  const doc = parseMinutesDoc(`[목적]
- 하반기 구매 계획 확정

[안건]
- 하반기 물량 추정
- 자료 검증

[안건별]
### 하반기 물량 추정 | 구매
■ 현재상황
- 상반기 실적이 예년 평균에 크게 못 미침
■ 논의내용
- 하반기 물량 5,000개 (작년 하반기 평균)
- 당초 8,000개를 검토했으나 뒷받침 자료를 받지 못해 평균치를 적용
- 품목 | 물량 | 산출근거
- 포장재 | 5,000개 | 작년 하반기 평균
■ 결론
- 작년 하반기 평균치로 산정한다
■ 조치사항
- 하반기 추정치 반영

### 자료 검증 | 총무
■ 논의내용
- 자료별 합계가 서로 다름

[조치사항]
- 실적 원자료 수령 | 구매담당 | 8월 중 | 자료 수령 대기 | 구매

[미결]
- 어느 자료를 기준으로 할지

[확인 필요]
- 합계 수량이 흐릿함`)

  it('★ 논의내용이 여러 줄로 담긴다 — 한 줄 제약이 사라졌다', () => {
    expect(doc.items[0].discussion.split('\n')).toEqual([
      '하반기 물량 5,000개 (작년 하반기 평균)',
      '당초 8,000개를 검토했으나 뒷받침 자료를 받지 못해 평균치를 적용',
      '품목 | 물량 | 산출근거',
      '포장재 | 5,000개 | 작년 하반기 평균',
    ])
  })

  it('★ 논의내용 안의 세로줄은 표의 한 행이지 칸 나누기가 아니다', () => {
    expect(doc.items[0].discussion).toContain('포장재 | 5,000개 | 작년 하반기 평균')
  })

  it('제목과 분류를 「### 제목 | 분류」에서 읽는다', () => {
    expect(doc.items.map((i) => i.title)).toEqual(['하반기 물량 추정', '자료 검증'])
    expect(doc.items[0].area).toBe('구매')
  })

  it('네 칸이 각자 자리에 담긴다', () => {
    expect(doc.items[0].situation).toBe('상반기 실적이 예년 평균에 크게 못 미침')
    expect(doc.items[0].conclusion).toBe('작년 하반기 평균치로 산정한다')
    expect(doc.items[0].action).toBe('하반기 추정치 반영')
  })

  it('안 나온 칸은 비어 있다 — 채우려고 지어내지 않는다', () => {
    expect(doc.items[1].situation).toBe('')
    expect(doc.items[1].conclusion).toBe('')
  })

  /*
    ★ 이게 이 파서에서 가장 잘 깨지는 자리다.
    「조치사항」은 **두 자리에 다 있는 말**이다 — 안건 안의 소제목이기도 하고
    전체 조치 목록의 큰 칸 이름이기도 하다. 구별을 못 하면 안건 안의
    「■ 조치사항」에서 파서가 블록을 빠져나가, 그 뒤 논의가 통째로
    조치 목록에 섞인다. 대괄호로 감싼 줄만 큰 칸으로 본다.
  */
  it('★ 안건 안의 「■ 조치사항」이 조치 목록으로 새지 않는다', () => {
    expect(doc.actions).toHaveLength(1)
    expect(doc.actions[0].text).toBe('실적 원자료 수령')
    expect(doc.actions[0].owner).toBe('구매담당')
    expect(doc.actions[0].note).toBe('자료 수령 대기')
  })

  it('블록 뒤의 큰 칸들이 제자리에 읽힌다', () => {
    expect(doc.purpose).toEqual(['하반기 구매 계획 확정'])
    expect(doc.agenda).toEqual(['하반기 물량 추정', '자료 검증'])
    expect(doc.pending).toEqual(['어느 자료를 기준으로 할지'])
    expect(doc.checks).toEqual(['합계 수량이 흐릿함'])
  })
})

describe('안건 블록 — 모델이 형식을 어겨도 읽는다', () => {
  it('옛 한 줄 형식을 그대로 읽는다', () => {
    const doc = parseMinutesDoc(`[안건별]
- 단가 인상 | 12% 통보 | 근거 확인 필요 | 기존 단가 유지 | 견적 받기 | 구매`)
    expect(doc.items).toHaveLength(1)
    expect(doc.items[0].situation).toBe('12% 통보')
    expect(doc.items[0].conclusion).toBe('기존 단가 유지')
  })

  it('「안건1.」 머리로 열어도 블록으로 읽는다', () => {
    const doc = parseMinutesDoc(`[안건별]
안건1. 단가 인상
■ 논의내용
- 근거를 확인해야 함`)
    expect(doc.items[0].title).toBe('단가 인상')
    expect(doc.items[0].discussion).toBe('근거를 확인해야 함')
  })

  it('소제목에 ■ 가 없어도 읽는다', () => {
    const doc = parseMinutesDoc(`[안건별]
### 단가 인상
논의내용
- 근거를 확인해야 함
결론
- 기존 단가 유지`)
    expect(doc.items[0].discussion).toBe('근거를 확인해야 함')
    expect(doc.items[0].conclusion).toBe('기존 단가 유지')
  })

  it('소제목과 같은 줄에 내용이 붙어 있어도 잃지 않는다', () => {
    const doc = parseMinutesDoc(`[안건별]
### 단가 인상
■ 논의내용: 근거를 확인해야 함
■ 결론: 기존 단가 유지`)
    expect(doc.items[0].discussion).toBe('근거를 확인해야 함')
    expect(doc.items[0].conclusion).toBe('기존 단가 유지')
  })

  it('소제목 없이 바로 내용이 오면 논의내용으로 본다 — 버리지 않는다', () => {
    const doc = parseMinutesDoc(`[안건별]
### 단가 인상
- 근거를 확인해야 함`)
    expect(doc.items[0].discussion).toBe('근거를 확인해야 함')
  })
})
