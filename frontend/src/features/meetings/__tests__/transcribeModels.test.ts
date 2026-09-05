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
   * 다 없어지면 지어낸 말을 거르는 그물이 낱말 목록 한 겹만 남는데,
   * 그 상태로 기본값이 되면 아무도 모르게 회의록이 나빠진다.
   */
  it('숫자를 주는 모델이 남아 있고, 그게 기본값이다', () => {
    expect(TRANSCRIBE_MODELS.some((m) => m.givesSpeechProb)).toBe(true)
    expect(findTranscribeModel(DEFAULT_TRANSCRIBE_MODEL)?.givesSpeechProb).toBe(true)
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
