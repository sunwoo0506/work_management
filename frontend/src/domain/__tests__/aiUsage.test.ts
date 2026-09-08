import { describe, expect, it } from 'vitest'
import {
  byFeature,
  byVendor,
  hours,
  isPriced,
  monthStart,
  summarize,
  vendorOf,
  won,
  wonOf,
} from '../aiUsage'
import type { UsageRow } from '../aiUsage'

const row = (v: Partial<UsageRow>): UsageRow => ({
  feature: '질문',
  model: 'gpt-5.6-sol',
  tokens_in: null,
  tokens_out: null,
  audio_sec: null,
  ok: true,
  created_at: '2026-09-08T00:00:00Z',
  ...v,
})

describe('wonOf — 한 줄이 얼마인가', () => {
  it('글 부르기는 들어온 토큰과 나간 토큰을 따로 곱한다', () => {
    // 1,000 * 1.8 + 1,000 * 14.0 = 15.8
    const v = wonOf(row({ model: 'gpt-5.6-sol', tokens_in: 1000, tokens_out: 1000 }))
    expect(v).toBeCloseTo(15.8, 5)
  })

  it('받아쓰기는 길이(분)로 매긴다', () => {
    // 300초 = 5분 * 8.5 = 42.5
    const v = wonOf(row({ feature: '전사', model: 'whisper-1', audio_sec: 300 }))
    expect(v).toBeCloseTo(42.5, 5)
  })

  /*
    ★ 모르는 모델을 0 으로 계산하는 것 자체는 맞다 — 지어낸 단가로 채우면
    틀린 줄 모르고 지나간다. 대신 **몇 건이 그런지 따로 센다.**
    그게 없으면 새 모델로 갈아탄 순간 사용량이 통째로 「공짜」로 보인다.
  */
  it('★ 모르는 모델은 0원이지만 「단가 모름」으로 세어 둔다', () => {
    const r = row({ model: 'gpt-6-미래모델', tokens_in: 9999, tokens_out: 9999 })
    expect(wonOf(r)).toBe(0)
    expect(isPriced(r)).toBe(false)
    expect(byFeature([r])[0].unpriced).toBe(1)
  })
})

describe('byFeature — 어디서 나갔나', () => {
  const rows = [
    row({ feature: '채굴', model: 'gpt-5.6-sol', tokens_in: 10000, tokens_out: 2000 }),
    row({ feature: '채굴', model: 'gpt-5.6-sol', tokens_in: 10000, tokens_out: 2000 }),
    row({ feature: '회의록', model: 'gpt-5.6-sol', tokens_in: 4000, tokens_out: 3000 }),
    row({ feature: '질문', model: 'gpt-5.6-terra', tokens_in: 500, tokens_out: 200 }),
    row({ feature: '질문', model: 'gpt-5.6-terra', ok: false }),
  ]

  it('★ 많이 쓴 순서로 준다 — 줄일 곳부터 보여야 한다', () => {
    expect(byFeature(rows).map((t) => t.feature)).toEqual(['채굴', '회의록', '질문'])
  })

  it('기능별로 호출 수와 토큰을 모은다', () => {
    const 채굴 = byFeature(rows)[0]
    expect(채굴.calls).toBe(2)
    expect(채굴.tokensIn).toBe(20000)
    expect(채굴.tokensOut).toBe(4000)
  })

  it('실패한 호출도 세지만 따로 표시한다', () => {
    const 질문 = byFeature(rows).find((t) => t.feature === '질문')
    expect(질문?.calls).toBe(2)
    expect(질문?.failed).toBe(1)
  })

  /*
    실시간 받아쓰기는 토막 길이를 안 보낸다 — 15초짜리라 짐작으로 채우느니
    비워 뒀다(api.ts). 그러면 **금액이 실제보다 적게 잡힌다.**
    그 사실을 숨기면 사용자가 화면의 금액을 그대로 믿는다.
  */
  it('★ 길이를 모르는 받아쓰기를 따로 센다 — 금액이 적게 잡힌다는 표시', () => {
    const t = byFeature([
      row({ feature: '전사', model: 'whisper-1', audio_sec: 300 }),
      row({ feature: '전사', model: 'whisper-1', audio_sec: null }),
    ])[0]
    expect(t.calls).toBe(2)
    expect(t.unknownLength).toBe(1)
    expect(t.audioSec).toBe(300)
  })

  it('빈 목록에도 죽지 않는다', () => {
    expect(byFeature([])).toEqual([])
    expect(summarize([]).won).toBe(0)
  })
})

describe('summarize — 한 줄 요약', () => {
  it('전체 합을 낸다', () => {
    const s = summarize([
      row({ feature: '채굴', model: 'gpt-5.6-sol', tokens_in: 1000, tokens_out: 1000 }),
      row({ feature: '전사', model: 'whisper-1', audio_sec: 60 }),
    ])
    expect(s.calls).toBe(2)
    expect(s.won).toBeCloseTo(15.8 + 8.5, 5)
  })
})

/*
  ⚠️ 날짜는 이 저장소에서 실제로 결함이 났던 자리다.
  로컬 벽시계 리터럴을 쓴다 — ISO 문자열은 절대 시각을 고정하는데
  구현은 로컬 달력일을 본다 (CLAUDE.md 날짜 규칙).
*/
describe('monthStart — 이번 달 1일', () => {
  it('그 달 1일 0시를 로컬 시각으로 준다', () => {
    const m = monthStart(new Date(2026, 8, 8, 14, 30))
    expect(m.getFullYear()).toBe(2026)
    expect(m.getMonth()).toBe(8)
    expect(m.getDate()).toBe(1)
    expect(m.getHours()).toBe(0)
  })

  it('1일에 불러도 그 달 1일이다', () => {
    expect(monthStart(new Date(2026, 0, 1, 0, 0)).getMonth()).toBe(0)
  })
})

describe('보기 좋게 적기', () => {
  it('★ 100원 미만은 소수점까지 — 0원으로 보이면 안 쓴 줄 안다', () => {
    expect(won(12.34)).toBe('12.3원')
    expect(won(0.4)).toBe('0.4원')
  })

  it('큰 금액은 반올림하고 자릿점을 찍는다', () => {
    expect(won(12345.6)).toBe('12,346원')
  })

  it('안 쓴 것은 0원', () => {
    expect(won(0)).toBe('0원')
  })

  it('길이는 시간·분으로', () => {
    expect(hours(0)).toBe('0분')
    expect(hours(600)).toBe('10분')
    expect(hours(4320)).toBe('1시간 12분')
  })
})

/*
  ★ 2026-09-08 에 실제로 겪은 일.
  단가표에 **실제로 안 쓰는 모델 이름**을 적어 놓아서 화면이
  「단가를 모르는 모델 2건」만 띄웠다. 개수만 보고는 **무엇을 적어야 할지
  알 수 없어** 못 고쳤다. 이름을 보여 줘야 고칠 수 있다.
*/
describe('단가표에 없는 모델 — 이름을 알려 준다', () => {
  it('★ 개수만 세지 않고 어떤 모델인지 이름을 모은다', () => {
    const s = summarize([
      row({ model: '안-적힌-모델' }),
      row({ model: '안-적힌-모델' }),
      row({ model: '다른-안-적힌-모델' }),
      row({ model: 'gpt-5.6-sol', tokens_in: 100, tokens_out: 100 }),
    ])
    expect(s.unpriced).toBe(3)
    expect(s.unpricedModels).toEqual(['다른-안-적힌-모델', '안-적힌-모델'])
  })

  it('전부 단가표에 있으면 빈 목록', () => {
    const s = summarize([row({ model: 'gpt-5.6-sol', tokens_in: 10, tokens_out: 10 })])
    expect(s.unpricedModels).toEqual([])
  })

  it('실제로 쓰는 모델 이름이 단가표에 있다 — 이게 틀려서 겪은 일이다', () => {
    expect(isPriced(row({ model: 'gpt-5.6-sol' }))).toBe(true)
    expect(isPriced(row({ model: 'gpt-5.6-terra' }))).toBe(true)
    expect(isPriced(row({ feature: '전사', model: 'gemini-3.5-transcribe', audio_sec: 60 }))).toBe(true)
  })
})

/*
  ★ 이 툴은 두 회사를 같이 쓴다 — 글은 OpenAI, 받아쓰기는 구글.
  그런데 실제 청구액을 물어볼 수 있는 곳은 OpenAI 뿐이다(구글은 조회 API 가 없다).
  그래서 어림값이라도 **회사별로 갈라** 보여 줘야, 「실제 청구액」과
  「어림값」의 세는 범위가 다르다는 게 드러난다.
*/
describe('회사별로 가른다 — OpenAI 와 구글', () => {
  it('모델 이름으로 어느 회사인지 가린다', () => {
    expect(vendorOf('gpt-5.6-sol')).toBe('OpenAI')
    expect(vendorOf('whisper-1')).toBe('OpenAI')
    expect(vendorOf('gemini-3.5-transcribe')).toBe('구글')
    expect(vendorOf('')).toBe('모름')
    expect(vendorOf('처음-보는-모델')).toBe('모름')
  })

  it('회사별로 호출 수와 금액을 모은다', () => {
    const v = byVendor([
      row({ model: 'gpt-5.6-sol', tokens_in: 1000, tokens_out: 1000 }),
      row({ feature: '전사', model: 'gemini-3.5-transcribe', audio_sec: 600 }),
      row({ feature: '전사', model: 'gemini-3.5-transcribe', audio_sec: 600 }),
    ])
    const 구글 = v.find((x) => x.vendor === '구글')
    const openai = v.find((x) => x.vendor === 'OpenAI')
    expect(구글?.calls).toBe(2)
    expect(구글?.won).toBeCloseTo(170, 5) // 10분 * 8.5 * 2
    expect(openai?.calls).toBe(1)
    expect(openai?.won).toBeCloseTo(15.8, 5)
  })

  it('요약에도 회사별이 들어 있다', () => {
    const s = summarize([row({ feature: '전사', model: 'gemini-3.5-transcribe', audio_sec: 60 })])
    expect(s.vendors).toHaveLength(1)
    expect(s.vendors[0].vendor).toBe('구글')
  })
})
