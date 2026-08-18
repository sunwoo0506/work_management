/**
 * 받아쓰기가 **지어낸 말**을 걸러낸다.
 *
 * ── 왜 이런 게 필요한가 ──────────────────────────────────
 * 받아쓰기 모델은 유튜브 자막을 대량으로 보고 배웠다. 그래서 **소리가 없거나
 * 아주 작은 토막**을 받으면 "빈 답"을 내는 대신 **자막에서 제일 흔한 문장**을
 * 지어낸다. 대표적인 것이 「시청해주셔서 감사합니다」다.
 *
 * 실제로 회의 중에 자꾸 나왔다(2026-08-19). 회의에서 아무도 한 적 없는 말이다.
 *
 * ── 왜 계산으로 막나 ─────────────────────────────────────
 * AI 에게 "지어내지 마라"고 시킬 수는 없다. 받아쓰기 모델에는 규칙을 주는 자리가
 * 없다(용어 힌트뿐이다). 그래서 **나온 글을 보고 거른다.** 계산이라
 * 시험할 수 있고, 공짜고, 모델을 갈아끼워도 그대로다 (CLAUDE.md).
 *
 * ── 무엇을 조심해야 하나 ────────────────────────────────
 * **너무 많이 걸러내면 사람이 한 말을 잃는다.** 회의에서 「감사합니다」는
 * 실제로 나오는 말이다. 그래서 **토막 전체가 그 말 하나뿐일 때만** 버린다.
 * 다른 말과 섞여 있으면 사람이 한 말로 본다.
 */

/** 견줘 보기 좋게 다듬는다 — 공백·문장부호·느낌표를 털어낸다 */
function normalize(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, '') // 앞에 붙은 [00:12] 같은 시각 표시
    .replace(/[\s.,!?~…"'"'()·・]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * 통째로 이것뿐이면 지어낸 것으로 보는 말들.
 *
 * 유튜브 자막에 수없이 나오는 문장들이다. **회의록에 이 말만 있는 토막은 없다.**
 * 새로 발견되면 여기 한 줄 더한다 — 고칠 자리를 한 곳으로 모아 뒀다.
 *
 * ⚠️ **이 목록만으로는 부족하다.** 「독도는 범죄로 지치고 바나나도 의지」처럼
 *    처음 보는 헛소리는 여기 없다. 그건 `keepSpoken()` 이 숫자로 잡는다.
 *    이 목록은 그 그물을 빠져나온 것을 거르는 **마지막 체**다.
 */
const KNOWN = [
  '시청해주셔서감사합니다',
  '시청해주셔서감사드립니다',
  '오늘도시청해주셔서감사합니다',
  '끝까지시청해주셔서감사합니다',
  '봐주셔서감사합니다',
  '시청감사합니다',
  '구독과좋아요부탁드립니다',
  '구독좋아요알림설정부탁드립니다',
  '구독과좋아요알림설정까지부탁드립니다',
  '다음영상에서만나요',
  '다음시간에만나요',
  '오늘영상은여기까지입니다',
  '오늘영상은여기까지입니다감사합니다',
  '영상은여기까지입니다',
  '이만마치겠습니다',
  '감사합니다',
  '고맙습니다',
  '수고하셨습니다',
  'thanksforwatching',
  'thankyouforwatching',
  'pleasesubscribe',
  '한글자막by',
  '자막제공',
]

/** 「MBC 뉴스 ○○○입니다」 같은 방송 마무리 멘트 */
const NEWS = /^[가-힣a-z]{2,10}뉴스[가-힣]{2,5}입니다$/

/**
 * 이 토막의 받아쓴 글이 통째로 「지어낸 말」인가.
 *
 * @param text 토막 하나에서 나온 글 전체
 */
export function isHallucination(text: string): boolean {
  const v = normalize(text)
  if (!v) return false
  if (KNOWN.includes(v)) return true
  if (NEWS.test(v)) return true

  // 같은 말이 세 번 넘게 되풀이되는 것도 지어낸 것이다.
  // 조용한 토막에서 모델이 같은 문장을 계속 뱉는 일이 있다
  return isRepeated(text)
}

/**
 * 같은 문장을 되풀이하고 있나.
 *
 * 조용한 소리를 받으면 모델이 **한 문장을 계속 반복**하는 일이 있다.
 * 「네 네 네 네 네」처럼 사람이 실제로 하는 반복과 구분하려고
 * **네 번 이상 · 두 글자 넘는 말**일 때만 본다.
 */
function isRepeated(text: string): boolean {
  const parts = text
    .split(/[.!?\n]/)
    .map((p) => normalize(p))
    .filter((p) => p.length > 2)
  if (parts.length < 4) return false
  return new Set(parts).size === 1
}

/**
 * 받아쓴 글에서 지어낸 말을 털어낸다. 통째로 지어낸 것이면 빈 문자열.
 *
 * 토막 단위로 부르는 것이 전제다 — 회의 전체 글에 쓰면
 * **가운데 있는 「감사합니다」까지 지워진다.**
 */
export function dropHallucination(text: string): string {
  return isHallucination(text) ? '' : text.trim()
}


/**
 * 받아쓰기가 토막마다 붙여 주는 「이게 정말 말이었나」 숫자.
 *
 * 이름을 우리 식으로 바꿔 받는다 — 공급자를 갈아끼워도 이 파일이 안 바뀌게.
 */
export type SpeechSegment = {
  text: string
  /** 이게 말이 아닐 확률 (0~1). 높으면 지어낸 것 */
  noSpeechProb: number | null
  /** 얼마나 확신하는가 (음수, 0 에 가까울수록 확신) */
  avgLogprob: number | null
  /** 같은 말을 되풀이하면 커진다 */
  compressionRatio: number | null
}

/**
 * ── 왜 이 값들인가 (2026-08-19 에 직접 재서 정했다) ──────
 *
 * | | 말없음확률 | 확신도 |
 * |---|---|---|
 * | 무음 (지어낸 말) | **0.802** | -0.679 |
 * | 사람 말          | **0.008** | -0.267 |
 *
 * 말없음확률은 **100배** 갈라진다. 그래서 이게 주된 잣대다.
 * 확신도는 덜 갈라지므로 **아주 낮을 때만** 쓴다 — 어중간하게 쓰면 사람 말이 날아간다.
 */
const 말없음_한계 = 0.6
const 확신도_바닥 = -1.0
/** 같은 말을 계속 뱉으면 이 값이 커진다. 받아쓰기 쪽에서 흔히 쓰는 기준이 2.4 다 */
const 되풀이_한계 = 2.4

/**
 * 말이 아닌 토막을 걸러내고 남은 글만 잇는다.
 *
 * ── 왜 숫자로 거르나 ─────────────────────────────────────
 * 낱말 목록(`KNOWN`)은 **본 것만** 잡는다. 실제 회의록에
 * 「독도는 범죄로 지치고 바나나도 의지」 같은 게 들어왔는데, 이런 건 목록에 없다.
 * 받아쓰기가 **스스로 알려주는 확신도**를 보면 처음 보는 헛소리도 잡힌다.
 *
 * ── 무엇을 조심했나 ──────────────────────────────────────
 * 잘못 버리면 **사람이 한 말이 아무도 모르게 사라진다.**
 * 그래서 ① 숫자가 없으면(못 받았으면) **버리지 않고 남기고**
 * ② 확신도는 **바닥일 때만** 본다.
 *
 * `segments` 가 아예 없으면 `whole` 을 그대로 쓴다 — 옛 판 서버와도 돌아간다.
 */
export function keepSpoken(whole: string, segments?: SpeechSegment[] | null): string {
  if (!segments || segments.length === 0) return dropHallucination(whole)

  const kept = segments
    .filter((s) => {
      if (s.noSpeechProb !== null && s.noSpeechProb >= 말없음_한계) return false
      if (s.avgLogprob !== null && s.avgLogprob <= 확신도_바닥) return false
      if (s.compressionRatio !== null && s.compressionRatio >= 되풀이_한계) return false
      return true
    })
    .map((s) => s.text.trim())
    .filter(Boolean)

  return dropHallucination(kept.join(' '))
}
