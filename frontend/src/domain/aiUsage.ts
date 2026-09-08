/**
 * AI 사용량 집계 — **어디서 돈이 나갔나**를 센다.
 *
 * ── 왜 여기(domain)에 있나 ───────────────────────────────
 * 「계산으로 되는 것은 AI 에 맡기지 않는다」(CLAUDE.md). 이건 전부 덧셈이다.
 * DB 나 브라우저 없이 시험할 수 있어야 **금액이 맞는지 확신할 수 있다.**
 * 돈 계산이 틀리면 「많이 쓰네」와 「이상하다」를 구분하지 못한다.
 *
 * ── ★ 단가는 왜 DB 에 안 넣나 ────────────────────────────
 * 공급자가 단가를 바꾼다. DB 에 넣어 두면 그때부터 **지난 기록이 틀린 금액을
 * 말한다.** 그래서 표에는 「센 값」(토큰 수·초)만 남기고, 금액은 **볼 때**
 * 여기서 곱한다. 단가가 바뀌면 이 파일 한 곳만 고친다.
 *
 * ⚠️ 그래서 여기 나오는 금액은 **어림값이다.** 진짜 청구액은 공급자의
 *    결제 화면이 원본이다. 이 화면은 「어느 기능이 얼마나」를 보는 곳이지
 *    「얼마 내야 하나」를 보는 곳이 아니다.
 */

/** ai_usage 표 한 줄 중 집계에 쓰는 것만 */
export type UsageRow = {
  feature: string
  model: string
  tokens_in: number | null
  tokens_out: number | null
  audio_sec: number | null
  ok: boolean
  created_at: string
}

/**
 * 단가표 — **여기 한 곳만 고치면 된다.**
 *
 * 원 단위로 적는다. 달러로 두면 환율까지 곱해야 하고, 그러면 환율을
 * 어디서 가져올지가 또 문제가 된다. 사용자가 보는 건 원화다.
 *
 * ⚠️ **공급자가 바꾸면 여기가 틀린다.** 그래서 화면이 「어림값」이라고 밝히고,
 *    이 표가 마지막으로 언제 맞았는지도 같이 적어 둔다.
 */
export const PRICED_AT = '2026-09-08'

/**
 * 글 부르기 — 1,000토큰당 원.
 *
 * ⚠️ **처음에 여기가 틀려 있었다** (2026-09-08). 실제로 쓰는 모델 이름을
 *    확인하지 않고 짐작으로 적어서, 사용량 화면이 「단가를 모르는 모델 2건」만
 *    띄웠다. 모델 이름은 `_shared/provider/openai.ts` 의 기본값과
 *    환경변수 `AI_MODEL`·`AI_MODEL_LIGHT` 가 정한다 — **거기를 보고 맞춘다.**
 */
const TEXT_WON: Record<string, { in: number; out: number }> = {
  // 판단이 섞인 일 — 회의록·채굴·질문
  'gpt-5.6-sol': { in: 1.8, out: 14.0 },
  // 가벼운 일 — 체크리스트 뽑기
  'gpt-5.6-terra': { in: 0.35, out: 2.8 },
}

/** 소리 받아쓰기 — 1분당 원 */
const AUDIO_WON: Record<string, number> = {
  'gemini-3.5-transcribe': 8.5,
  'whisper-1': 8.5,
  'gpt-transcribe': 8.5,
}

/**
 * 모르는 모델일 때 쓰는 값.
 *
 * **0 으로 두지 않는다.** 0 이면 새 모델로 갈아탄 순간 사용량이 통째로
 * 「공짜」로 보인다. 눈에 띄는 편이 낫다 — 화면이 「단가 모름」으로 따로 센다.
 */
export function isPriced(row: UsageRow): boolean {
  return row.audio_sec != null ? row.model in AUDIO_WON : row.model in TEXT_WON
}

/** 한 줄이 얼마인가 (원, 어림값). 단가를 모르면 0 */
export function wonOf(row: UsageRow): number {
  if (row.audio_sec != null) {
    const perMin = AUDIO_WON[row.model]
    if (!perMin) return 0
    return (row.audio_sec / 60) * perMin
  }
  const p = TEXT_WON[row.model]
  if (!p) return 0
  return ((row.tokens_in ?? 0) / 1000) * p.in + ((row.tokens_out ?? 0) / 1000) * p.out
}

export type FeatureTotal = {
  feature: string
  calls: number
  /** 실패한 호출. **실패해도 돈이 나가는 경우가 있고**, 재시도가 많으면 여기서 보인다 */
  failed: number
  tokensIn: number
  tokensOut: number
  audioSec: number
  won: number
  /** 단가를 모르는 호출 수. 0 이면 아래 금액을 믿어도 된다 */
  unpriced: number
  /** 길이를 모르는 받아쓰기 호출 수 — 그만큼 금액이 실제보다 적게 잡힌다 */
  unknownLength: number
}

/**
 * 기능별로 묶어 센다. **많이 쓴 순서**로 돌려준다 — 줄일 곳부터 보여야 한다.
 */
export function byFeature(rows: readonly UsageRow[]): FeatureTotal[] {
  const map = new Map<string, FeatureTotal>()

  for (const r of rows) {
    let t = map.get(r.feature)
    if (!t) {
      t = {
        feature: r.feature,
        calls: 0,
        failed: 0,
        tokensIn: 0,
        tokensOut: 0,
        audioSec: 0,
        won: 0,
        unpriced: 0,
        unknownLength: 0,
      }
      map.set(r.feature, t)
    }
    t.calls += 1
    if (!r.ok) t.failed += 1
    t.tokensIn += r.tokens_in ?? 0
    t.tokensOut += r.tokens_out ?? 0
    t.audioSec += r.audio_sec ?? 0
    t.won += wonOf(r)
    if (!isPriced(r)) t.unpriced += 1
    /*
      받아쓰기인데 길이를 모르는 줄. 실시간 받아쓰기가 여기 들어온다 —
      15초짜리 토막이라 짐작으로 채우느니 비워 뒀다(api.ts).
      **비워 둔 것을 숨기지 않고 센다** — 그만큼 금액이 적게 잡히기 때문이다.
    */
    if (r.feature === '전사' && r.audio_sec == null) t.unknownLength += 1
  }

  return [...map.values()].sort((a, b) => b.won - a.won || b.calls - a.calls)
}

export type UsageSummary = {
  totals: FeatureTotal[]
  calls: number
  failed: number
  won: number
  unpriced: number
  unknownLength: number
  /**
   * 단가표에 없는 **모델 이름들.**
   *
   * ★ 개수만 세면 못 고친다. 「2건이 단가를 모른다」만 보고는 **무엇을 적어야
   * 할지 알 수 없다.** 이름을 보여 줘야 단가표에 그 줄을 더할 수 있다.
   * 2026-09-08 에 실제로 그래서 못 고쳤다.
   */
  unpricedModels: string[]
}

export function summarize(rows: readonly UsageRow[]): UsageSummary {
  const totals = byFeature(rows)
  const names = new Set<string>()
  for (const r of rows) {
    if (!isPriced(r)) names.add(r.model || '(이름 없음)')
  }
  return {
    totals,
    calls: totals.reduce((n, t) => n + t.calls, 0),
    failed: totals.reduce((n, t) => n + t.failed, 0),
    won: totals.reduce((n, t) => n + t.won, 0),
    unpriced: totals.reduce((n, t) => n + t.unpriced, 0),
    unknownLength: totals.reduce((n, t) => n + t.unknownLength, 0),
    unpricedModels: [...names].sort(),
  }
}

/**
 * 이번 달 1일 0시. 「이번 달 얼마 썼나」의 시작점.
 *
 * ⚠️ **로컬 벽시계로 만든다.** ISO 문자열로 고정하면 시간대가 다른 곳에서
 *    하루가 밀린다 — 이 저장소에서 실제로 결함이 났던 자리다 (CLAUDE.md 날짜 규칙).
 */
export function monthStart(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
}

/** 「1,234원」처럼. 100원 미만은 소수점 한 자리까지 — 0원으로 보이면 안 된다 */
export function won(v: number): string {
  if (v <= 0) return '0원'
  if (v < 100) return `${v.toFixed(1)}원`
  return `${Math.round(v).toLocaleString()}원`
}

/** 「1시간 12분」처럼 */
export function hours(sec: number): string {
  if (sec <= 0) return '0분'
  const m = Math.round(sec / 60)
  if (m < 60) return `${m}분`
  return `${Math.floor(m / 60)}시간 ${m % 60}분`
}
