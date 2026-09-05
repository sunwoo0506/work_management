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
  /**
   * 1분당 요금 (달러).
   *
   * **화면에 보여 주는 값은 이것뿐이다** (2026-09-05, 사용자 판단).
   * 모델마다 한 줄 설명을 달았더니 회의 시작 직전 화면이 설명으로 꽉 찼다.
   * 요금은 **누를 때마다 달라지고 이 자리에서만 알 수 있는 값**이라 남겼다.
   * 나머지 성격은 아래 주석과 운영 안내에 있다.
   */
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
  /**
   * 2026-09-05 실측에서 **셋 중 가장 정확했고 가장 쌌다.** 사내 용어를
   * 낱말 목록으로 넘겨 「타이벡」을 맞힌 유일한 모델이다.
   *
   * ⚠️ **분당 들어오는 양에 한도가 있다**(1만 토큰). 5분짜리 조각을 여러 개
   *    동시에 던지면 거절당한다 — 그래서 녹음파일 올리기는 이 모델일 때
   *    한 줄로 보낸다 (AudioUpload.tsx).
   */
  {
    id: 'gemini-3.5-transcribe',
    label: '제미나이 받아쓰기',
    vendor: '구글',
    perMinuteUsd: 0.0035,
    givesSpeechProb: false,
  },
  /**
   * OpenAI 의 최신 받아쓰기. 조용한 구간에서 없는 말을 지어내지 않았다.
   * 다만 「타이벡」은 못 맞혔다 — 사내 용어를 한 줄 힌트로만 넘길 수 있어서다.
   */
  {
    id: 'gpt-transcribe',
    label: 'GPT 받아쓰기',
    vendor: 'OpenAI',
    perMinuteUsd: 0.0045,
    givesSpeechProb: false,
  },
  /**
   * 2026-09-05 까지 쓰던 것. **「말이 맞나」를 숫자로 알려 주는 유일한 모델**이라
   * 새 모델이 이상할 때 돌아올 자리다. 목록에서 빼지 않는다.
   */
  {
    id: 'whisper-1',
    label: 'Whisper',
    vendor: 'OpenAI',
    perMinuteUsd: 0.006,
    givesSpeechProb: true,
  },
]

/**
 * 아무것도 고르지 않았을 때 쓸 것.
 *
 * ── ⚠️ 2026-09-05 에 whisper-1 에서 바꿨다 ───────────────
 * **사용자가 정한 것이다.** 셋을 같은 소리로 재 보고 나서 바꿨다 —
 *
 *   정확도  제미나이만 「타이벡」을 맞혔다. 나머지 둘은 「타이백 자택」
 *   요금    분당 $0.0035 로 셋 중 제일 싸다 (whisper 는 $0.006)
 *   무음    빈 글을 냈다. 지어낸 쪽은 오히려 whisper 였다
 *
 * ⚠️ **바꾸는 것은 늘 의식적인 결정이어야 한다.** 시험이 이 값을 못 박아 둬서,
 *    여기를 고치면 시험이 깨진다. 그게 목적이다 — 「어쩌다 바뀌는 일」을 막는다.
 *
 * ⚠️ **아직 안 잰 것이 있다.** 폰 녹음 형식(webm)·여러 사람이 겹쳐 말하는
 *    진짜 회의 소리. 이상하면 화면에서 **Whisper** 를 누르면 그전으로 돌아간다.
 */
export const DEFAULT_TRANSCRIBE_MODEL = 'gemini-3.5-transcribe'

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
