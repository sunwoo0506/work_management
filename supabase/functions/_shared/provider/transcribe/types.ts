/**
 * 받아쓰기 어댑터 — 경계면.
 *
 * ── 왜 한 겹을 더 두나 ───────────────────────────────────
 * 옆의 `provider/` 는 **글을 주고받는** AI(회의록 요약·챗봇)를 감싼다.
 * 받아쓰기는 **소리를 보내는** 일이라 부르는 방식이 통째로 다르다 —
 * OpenAI 는 파일 폼으로, 제미나이는 JSON 안에 소리를 실어 보낸다.
 *
 * 그 차이를 여기서 흡수한다. **화면은 모델 이름만 보내고, 무엇이 다른지 모른다.**
 *
 * ⚠️ 여기 들어오는 모델 이름은 **사용자가 화면에서 고른 값**이다.
 *    코드에 박힌 목록이 아니라 그때그때 바뀐다 (CLAUDE.md — 모델명을 코드에 박지 않는다).
 */

/**
 * 토막 하나에 붙는 「이게 정말 말이었나」 숫자들.
 *
 * ⚠️ **주는 모델과 안 주는 모델이 있다.** whisper-1 만 준다.
 *    없으면 `null` 로 채워 보낸다 — 0 으로 두면 화면이 「확신한다」로 잘못 읽는다.
 */
export type TranscribeSegment = {
  text: string
  /** 이게 말이 아닐 확률 (0~1). 높으면 지어낸 것이다 */
  noSpeechProb: number | null
  /** 얼마나 확신하는가 (음수, 0 에 가까울수록 확신) */
  avgLogprob: number | null
  /** 같은 말을 되풀이하면 커진다 */
  compressionRatio: number | null
}

export type TranscribeResult = {
  text: string
  /**
   * 아직 받아쓰는 중인가 (2026-09-08).
   *
   * ── 왜 이 칸이 생겼나 ───────────────────────────────────
   * 30분짜리를 통째로 보내면 **몇 분이 걸린다.** 그동안 서버 함수가
   * 붙잡고 기다리면 함수가 먼저 끊긴다. 그래서 **맡겨 놓고 화면이 다시
   * 물어보게** 한다 — 이 값이 참이면 `jobId` 로 다시 물어보면 된다.
   */
  pending?: boolean
  /** 맡긴 일의 번호. `pending` 일 때만 있다 */
  jobId?: string
  /**
   * 화자를 **실제로 갈랐나** (2026-09-08).
   *
   * 켜 달라고 했는데 안 갈라져 오는 일이 있다 — 공급자가 그 설정을 조용히
   * 무시하거나, 답의 모양이 달라 우리가 못 읽거나.
   *
   * 그때 **아무 말이 없으면 「켰는데 왜 안 되지」로 끝난다.** 그래서
   * 갈렸는지를 그대로 돌려주고 화면이 밝힌다.
   */
  diarized?: boolean
  /** 숫자를 못 받는 모델이면 빈 배열. 화면은 그때 낱말 목록으로만 거른다 */
  segments: TranscribeSegment[]
  /** 실제로 쓴 모델. 화면이 「무엇으로 받아썼는지」를 보여 주는 데 쓴다 */
  model: string
}

export type TranscribeInput = {
  file: File
  /** 이 회의에 나올 사내 용어. 쉼표로 이어진 한 줄 */
  hint: string
  /** 사용자가 고른 모델 이름 */
  model: string
  /**
   * 아까 맡긴 일을 **다시 물어보는** 것이면 그 번호.
   * 이게 있으면 소리를 다시 보내지 않는다 — 이미 저쪽이 들고 있다.
   */
  jobId?: string
  /**
   * 화자 구분 받아쓰기 — 말한 사람별로 줄을 나눈다 (2026-09-08).
   *
   * ⚠️ **제미나이만 된다.** whisper 계열은 이 기능이 없어 그냥 무시한다 —
   *    거절하지 않는다. 모델을 바꿨다고 받아쓰기가 통째로 실패하면 안 된다.
   *
   * ⚠️ **구간마다 따로 매겨진다.** 5분씩 잘라 보내므로 3번 구간의 「화자1」과
   *    4번 구간의 「화자1」이 같은 사람이라는 보장이 없다. 회의록을 만드는
   *    AI 에게 그 사실을 알려 준다 (prompt.ts 의 MINE_RULES).
   */
  diarize?: boolean
  /**
   * 이 사람들 목소리는 **미리 등록돼 있다** (2026-09-08).
   *
   * ── 왜 값어치가 있나 ────────────────────────────────────
   * 화자 구분만 켜면 「화자1」·「화자2」로 나온다. 그게 누구인지는 아무도 모르고,
   * 구간이 갈리면 번호마저 이어지지 않는다.
   *
   * 목소리를 미리 등록해 두면 **「대표이사」·「경영지원부장」으로 바로 적힌다.**
   * 그러면 ① 누구인지 찾을 필요가 없고 ② **구간이 갈려도 이름은 안 흔들린다.**
   * 조치사항의 담당이 그대로 채워진다.
   *
   * ⚠️ **OpenAI 의 화자 구분 모델만 된다.** 제미나이는 이 기능이 없다.
   * ⚠️ 4명까지다. 넘으면 앞의 4명만 쓴다.
   */
  speakers?: { name: string; dataUrl: string }[]
}

export interface Transcriber {
  /** 공급자 이름. 화면에 안 보이고 기록·오류 메시지에만 쓴다 */
  readonly name: string
  run(input: TranscribeInput): Promise<TranscribeResult>
}

/**
 * 공급자가 거절했을 때.
 *
 * **숫자(status)와 원문을 그대로 들고 다닌다.** 여기서 우리말로 바꾸지 않는 이유는,
 * 「기다리면 풀리는 실패인가」를 가리는 자리가 `failure.ts` 한 곳이기 때문이다.
 * 여기서 미리 요약하면 그 판단에 필요한 단서가 지워진다 (2026-08-16 의 429 사건).
 */
export class TranscribeError extends Error {
  constructor(
    readonly status: number,
    readonly raw: string,
    /** 어느 회사가 거절했나. 안내에 엉뚱한 회사 이름이 들어가지 않게 하려고 들고 다닌다 */
    readonly provider: string = 'openai',
  ) {
    super(raw)
    this.name = 'TranscribeError'
  }
}

/** 열쇠가 없을 때. 공급자 잘못이 아니라 **우리 설정 잘못**이라 따로 둔다 */
export class MissingKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MissingKeyError'
  }
}

/** 숫자가 아니면 null 로 — 없는 값을 0 으로 두면 「확신한다」로 잘못 읽힌다 */
export function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
