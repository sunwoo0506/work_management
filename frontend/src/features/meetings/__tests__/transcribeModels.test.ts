import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_TRANSCRIBE_MODEL,
  TRANSCRIBE_MODELS,
  findTranscribeModel,
  readTranscribeModel,
  writeTranscribeModel,
} from '../transcribeModels'

/**
 * 받아쓰기 모델 목록이 **서버와 어긋나지 않는지** 지킨다.
 *
 * 이 목록은 화면에 있고, 받는 쪽은 Edge Function 에 있다. Deno 가 없어
 * 서버 코드에는 시험을 못 붙인다(CLAUDE.md). 그래서 **둘이 어긋날 수 있는
 * 자리를 화면 쪽에서 대신 지킨다** — 이름 모양과 기본값이 그것이다.
 */

/** 서버(`_shared/provider/transcribe/index.ts` checkModel)와 같은 규칙 */
const 서버가_받는_모양 = /^[a-z0-9][a-z0-9._-]{1,63}$/i

describe('받아쓰기 모델 목록', () => {
  it('모든 이름이 서버가 받는 모양이다', () => {
    for (const m of TRANSCRIBE_MODELS) {
      expect(서버가_받는_모양.test(m.id), m.id).toBe(true)
    }
  })

  it('같은 이름이 두 번 들어 있지 않다', () => {
    const ids = TRANSCRIBE_MODELS.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('기본값이 목록 안에 있다', () => {
    expect(findTranscribeModel(DEFAULT_TRANSCRIBE_MODEL)).toBeDefined()
  })

  /**
   * 「말이 맞나」 숫자를 주는 모델이 **적어도 하나는 남아 있어야 한다.**
   *
   * 2026-09-05 에 기본값이 제미나이로 바뀌면서 **기본값은 그 숫자를 안 준다.**
   * 그래서 whisper-1 은 목록에서 빠지면 안 된다 — 새 모델이 이상할 때
   * **한 번 눌러 돌아갈 자리**이자, 숫자로 걸러 보는 유일한 길이다.
   */
  it('숫자를 주는 모델이 목록에 남아 있다', () => {
    expect(TRANSCRIBE_MODELS.some((m) => m.givesSpeechProb)).toBe(true)
  })

  /**
   * 기본값을 못 박아 둔다.
   *
   * ── 왜 이런 시험을 두나 ─────────────────────────────────
   * 이 값은 **아무도 안 누르면 그대로 쓰이는 값**이다. 조용히 바뀌면
   * 회의록의 품질과 요금이 같이 바뀌는데 **아무도 눈치채지 못한다.**
   *
   * 그래서 고치면 시험이 깨지게 해 뒀다. **막으려는 게 아니라
   * 「지금 이걸 바꾸는 중이다」를 알아채게 하려는 것**이다.
   * 정말 바꿀 때는 이 줄과 위 설명을 같이 고치면서 왜 바꾸는지 남긴다.
   *
   * 2026-09-05 — 사용자 판단으로 whisper-1 → gemini-3.5-transcribe.
   * 셋을 같은 소리로 재 보고 정했다(정확도·요금·무음에서 모두 앞섰다).
   */
  it('기본값은 제미나이다 — 바꾸려면 이 시험도 같이 고친다', () => {
    expect(DEFAULT_TRANSCRIBE_MODEL).toBe('gemini-3.5-transcribe')
  })
})

describe('고른 값 기억하기', () => {
  beforeEach(() => localStorage.clear())

  it('고른 적이 없으면 기본값이다', () => {
    expect(readTranscribeModel()).toBe(DEFAULT_TRANSCRIBE_MODEL)
  })

  it('고르면 그대로 읽힌다', () => {
    writeTranscribeModel('gemini-3.5-transcribe')
    expect(readTranscribeModel()).toBe('gemini-3.5-transcribe')
  })

  /** 빈 값이 적혀 있어도 기본값으로 돈다 — 받아쓰기가 멈추면 안 된다 */
  it('적힌 값이 비어 있으면 기본값으로 돈다', () => {
    localStorage.setItem('wm.transcribe.model', '')
    expect(readTranscribeModel()).toBe(DEFAULT_TRANSCRIBE_MODEL)
  })
})
