/**
 * 받아쓰기 모델 — 무엇을 고를 수 있고, 무엇을 고른 상태인가.
 *
 * ── 왜 고를 수 있게 했나 (2026-09-05) ────────────────────
 * 그전에는 서버 코드에 `whisper-1` 한 줄이 박혀 있었다. 다른 모델을 써 보려면
 * 환경변수를 바꾸고 함수를 다시 배포해야 했고, 그러면 **같은 회의를 두 모델로
 * 받아써 견줄 수가 없었다.** 어느 쪽이 사내 용어를 잘 듣는지는
 * 실제 회의 소리로 재 보는 수밖에 없다.
 *
 * ── 왜 이 파일 하나인가 ─────────────────────────────────
 * 받아쓰기를 부르는 길이 넷이다 (실시간 · 실패한 토막 다시 · 녹음파일 올리기 ·
 * 지난 회의록 다시 받아쓰기). 목록을 여기저기 적으면 **언젠가 한 곳이 어긋난다.**
 * 2026-08-19 에 지어낸 말 거르기를 네 군데 중 한 군데에만 붙였다가 그대로 새어
 * 나온 적이 있다. 그래서 **고른 값을 읽고 쓰는 자리도 여기 하나뿐이다.**
 */

export type TranscribeModel = {
  /** AI 공급자에게 보내는 이름. 이 값이 그대로 서버로 간다 */
  id: string
  label: string
  vendor: 'OpenAI' | '구글'
  /** 화면에 보여 줄 한 줄 설명 */
  note: string
  /** 1분당 요금 (달러). 견줄 때 쓰라고 적어 둔다 */
  perMinuteUsd: number
  /**
   * 토막마다 「말없음확률」을 주는가.
   *
   * ── ⚠️ 2026-09-05 에 재 보고 뜻이 바뀐 값이다 ──────────
   * 처음엔 「이게 없으면 지어낸 말이 샌다」로 적었다. **재 보니 반대였다.**
   * 무음 15초를 세 모델에 똑같이 넣었더니 —
   *
   *   whisper-1       162자를 지어냈다 (같은 말 반복). 숫자 0.847 로 걸러졌다
   *   gpt-transcribe  빈 글
   *   gemini-3.5      빈 글
   *
   * **숫자 그물이 필요했던 건 whisper-1 자신 때문이었다.** 나머지 둘은
   * 애초에 안 지어내서 거를 것이 없었다.
   *
   * 그래도 이 값을 남겨 두는 이유 — **시험은 한 번뿐이고 회의실은 다양하다.**
   * 사람 목소리가 흐릿하게 섞인 구간에서도 그럴지는 아직 모른다.
   * 숫자가 없으면 **그때 잡을 그물이 낱말 목록뿐**인 것은 여전히 사실이다.
   */
  givesSpeechProb: boolean
}

/**
 * 고를 수 있는 모델.
 *
 * ⚠️ **여기 없는 모델도 서버는 받는다.** 이 목록은 「자주 쓰는 것을 눌러서
 *    고르게」 하는 편의일 뿐, 막는 장치가 아니다. 막고 싶으면 서버 환경변수
 *    `AI_TRANSCRIBE_MODELS` 로 잠근다 (운영 안내 참고).
 */
export const TRANSCRIBE_MODELS: TranscribeModel[] = [
  {
    id: 'whisper-1',
    label: 'Whisper',
    vendor: 'OpenAI',
    note: '지금까지 쓰던 것. 「말이 맞나」를 숫자로 알려 줍니다. 다만 조용한 구간에서 없는 말을 지어내는 것도 이 모델입니다 — 그 숫자로 걸러 냅니다.',
    perMinuteUsd: 0.006,
    givesSpeechProb: true,
  },
  {
    id: 'gpt-transcribe',
    label: 'GPT 받아쓰기',
    vendor: 'OpenAI',
    note: 'OpenAI 의 최신 받아쓰기. 값이 더 싸고, 조용한 구간에서 없는 말을 지어내지 않았습니다(2026-09-05 실측).',
    perMinuteUsd: 0.0045,
    givesSpeechProb: false,
  },
  {
    id: 'gemini-3.5-transcribe',
    label: '제미나이 받아쓰기',
    vendor: '구글',
    note: '2026-09-05 실측에서 셋 중 가장 정확했고 가장 쌌습니다. 사내 용어를 낱말 목록으로 넘겨 「타이벡」을 유일하게 맞혔습니다.',
    perMinuteUsd: 0.0035,
    givesSpeechProb: false,
  },
]

/**
 * 아무것도 고르지 않았을 때 쓸 것.
 *
 * whisper-1 을 그대로 둔다 — **지금까지 돌던 것이 바뀌면 안 되기 때문이다.**
 * 모델을 바꾸는 일은 사용자가 직접 눌러서 일어나야 한다.
 */
export const DEFAULT_TRANSCRIBE_MODEL = 'whisper-1'

/**
 * 고른 값을 이 브라우저에 적어 둔다.
 *
 * 서버(DB)에 안 두는 이유 — **기기마다 다르게 쓸 수 있어야 한다.**
 * 폰에서 녹음할 때와 컴퓨터에서 지난 녹음을 다시 받아쓸 때 다른 모델을
 * 써 보는 것이 이 기능의 목적이다.
 */
const KEY = 'wm.transcribe.model'

export function readTranscribeModel(): string {
  try {
    return localStorage.getItem(KEY) || DEFAULT_TRANSCRIBE_MODEL
  } catch {
    // 사생활 보호 모드 등에서 막힐 수 있다. 그때는 기본값으로 돈다
    return DEFAULT_TRANSCRIBE_MODEL
  }
}

export function writeTranscribeModel(id: string): void {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // 못 적어도 이번 회의는 그대로 진행된다 — 막을 일이 아니다
  }
}

/** 목록에 있는 것인지. 없으면 undefined — 화면은 그때 이름만 보여 준다 */
export function findTranscribeModel(id: string): TranscribeModel | undefined {
  return TRANSCRIBE_MODELS.find((m) => m.id === id)
}
