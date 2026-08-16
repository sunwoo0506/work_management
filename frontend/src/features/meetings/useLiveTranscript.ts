import { useCallback, useEffect, useRef, useState } from 'react'
import { appendFinal } from '../../domain/transcript'
import type { Segment } from '../../domain/transcript'

/**
 * 브라우저 받아쓰기 — 마이크를 열고 들린 말을 줄로 쌓는다.
 *
 * ── 왜 이 방식인가 ───────────────────────────────────────
 * 설계서 §5.8 은 「폰 녹음 파일 → 내 PC 에서 Whisper 전사」였고,
 * OQ-14 에 *"브라우저만으로는 불가능하다"* 라고 적혀 있었다. **그 판단이 틀렸다.**
 * 요즘 브라우저에는 받아쓰기가 내장돼 있다 — 브라우저가 직접 계산하는 게 아니라
 * **제조사 서버가 대신 해 준다.** 그래서 설치할 프로그램도, 켜 둘 컴퓨터도 없다.
 * (기획서 docs/plans/2026-08-16-live-meeting-notes.md)
 *
 * ⚠️ **음성이 브라우저 제조사(크롬이면 구글) 서버로 나간다.**
 *    그래서 자동으로 켜지지 않는다. 사용자가 「듣기 시작」을 눌러야만 열린다.
 *    회생·인사 같은 민감 회의에는 쓰지 않는다 — 화면에서 잠근다.
 *
 * ── 여기서 하지 않는 것 ──────────────────────────────────
 * 들린 토막을 어떻게 줄로 합칠지는 `domain/transcript.ts` 가 한다.
 * 여기 있는 것은 **마이크를 열고 닫고 다시 붙이는 일**뿐이다.
 */

// 브라우저 받아쓰기의 최소 모양. 표준 타입이 브라우저마다 달라 직접 적는다
type SRAlternative = { transcript: string }
type SRResult = { isFinal: boolean; length: number; [i: number]: SRAlternative }
type SREvent = { resultIndex: number; results: { length: number; [i: number]: SRResult } }
type SRErrorEvent = { error: string }
type SRLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SREvent) => void) | null
  onerror: ((e: SRErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
  onaudiostart: (() => void) | null
  onsoundstart: (() => void) | null
  onspeechstart: (() => void) | null
}
type SRCtor = new () => SRLike

function getCtor(): SRCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export type LiveStatus = '준비' | '듣는중' | '멈춤' | '끝'

/**
 * 받아쓰기 장치가 어디까지 왔나.
 *
 * ── 왜 이런 걸 두나 ──────────────────────────────────────
 * 폰에서 「듣기 시작」을 눌렀는데 **글자가 하나도 안 올라왔다.**
 * 그때 화면에는 「듣는 중」만 떠 있어서 *"듣고 있는 건지 모르겠다"* 가 됐다.
 *
 * 받아쓰기 장치는 단계마다 신호를 준다 — 켜졌다 / 소리가 들어온다 /
 * 사람 목소리 같다 / 글자가 나왔다. **그 단계를 그대로 보여 준다.**
 * 어디서 막혔는지가 보이면 「고장」이 아니라 「마이크가 멀다」를 알 수 있다.
 */
export type EngineStage = '꺼짐' | '켜짐' | '소리들어옴' | '말소리감지' | '글자나옴'

/**
 * 끊겼을 때 다시 붙이기.
 *
 * 받아쓰기는 몇십 초 조용하면 **혼자 끝난다.** 회의 중 잠깐 말이 없었다고
 * 받아쓰기가 죽으면 안 되므로 끝날 때마다 다시 켠다.
 * 다만 무한히 다시 켜면 안 된다 — 마이크가 없거나 권한이 막힌 상태에서는
 * 「켜자마자 끝」이 초당 수십 번 돈다. 그래서 횟수를 센다.
 */
const RESTART_WINDOW_MS = 10_000
const RESTART_LIMIT = 8

export function useLiveTranscript() {
  const [status, setStatus] = useState<LiveStatus>('준비')
  const [segments, setSegments] = useState<Segment[]>([])
  /** 아직 확정되지 않은, 지금 들리는 중인 말 */
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [stage, setStage] = useState<EngineStage>('꺼짐')

  const recRef = useRef<SRLike | null>(null)
  /** 지금 듣고 있어야 하는가. 「스스로 끝난 것」과 「사람이 멈춘 것」을 가른다 */
  const wantRef = useRef(false)
  /** 이전 구간까지 쌓인 시간 (일시정지를 건너뛰기 위해) */
  const baseRef = useRef(0)
  /** 이번 구간을 켠 벽시계 시각 */
  const startedRef = useRef(0)
  const restartsRef = useRef<number[]>([])

  const supported = getCtor() !== null
  // 마이크는 https 또는 localhost 에서만 열린다
  const secure = typeof window === 'undefined' || window.isSecureContext

  const elapsedNow = useCallback(
    () => baseRef.current + (wantRef.current ? Date.now() - startedRef.current : 0),
    [],
  )

  const spawn = useCallback(() => {
    const Ctor = getCtor()
    if (!Ctor) return

    const rec = new Ctor()
    rec.lang = 'ko-KR'
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1

    // 단계 신호. 어디까지 왔는지를 화면에 그대로 보여 준다
    rec.onstart = () => setStage((s) => (s === '꺼짐' ? '켜짐' : s))
    rec.onaudiostart = () => setStage((s) => (s === '켜짐' || s === '꺼짐' ? '소리들어옴' : s))
    rec.onsoundstart = () => setStage((s) => (s === '글자나옴' ? s : '말소리감지'))
    rec.onspeechstart = () => setStage((s) => (s === '글자나옴' ? s : '말소리감지'))

    rec.onresult = (e) => {
      const at = elapsedNow()
      let final = ''
      let live = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        const text = r[0]?.transcript ?? ''
        if (r.isFinal) final += text
        else live += text
      }
      if (final.trim() || live.trim()) {
        setStage('글자나옴')
        // 글자가 나왔으면 그동안의 「자꾸 끊긴다」 셈을 지운다.
        // 안드로이드는 한 마디마다 끊었다 다시 켜는 것이 **정상 동작**이라,
        // 지우지 않으면 잘 되고 있는데도 「계속 끊긴다」로 판정해 멈춰 버린다
        restartsRef.current = []
      }
      if (final.trim()) setSegments((prev) => appendFinal(prev, final, at))
      setInterim(live.trim())
    }

    rec.onerror = (e) => {
      // 조용해서 끝난 것·우리가 끈 것은 오류가 아니다. onend 가 알아서 다시 켠다
      if (e.error === 'no-speech' || e.error === 'aborted') return

      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        wantRef.current = false
        setStatus('멈춤')
        setError('마이크 사용이 막혀 있습니다. 주소창 왼쪽 자물쇠를 눌러 마이크를 허용해 주세요.')
      } else if (e.error === 'audio-capture') {
        wantRef.current = false
        setStatus('멈춤')
        setError('마이크를 찾지 못했습니다. 연결을 확인해 주세요.')
      } else if (e.error === 'network') {
        wantRef.current = false
        setStatus('멈춤')
        setError('받아쓰기 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.')
      } else {
        setError(`받아쓰기가 멈췄습니다 (${e.error}).`)
      }
    }

    rec.onend = () => {
      if (!wantRef.current) return

      const now = Date.now()
      restartsRef.current = restartsRef.current.filter((t) => now - t < RESTART_WINDOW_MS)
      if (restartsRef.current.length >= RESTART_LIMIT) {
        // ⚠️ 시간을 **먼저** 굳힌다. wantRef 를 내린 뒤에 재면
        //    이번 구간에 흐른 시간이 통째로 사라진다
        baseRef.current = elapsedNow()
        wantRef.current = false
        setStatus('멈춤')
        setError('받아쓰기가 계속 끊깁니다. 마이크 권한과 인터넷 연결을 확인한 뒤 다시 시작해 주세요.')
        return
      }
      restartsRef.current.push(now)
      spawn()
    }

    recRef.current = rec
    try {
      rec.start()
    } catch {
      // 이미 켜져 있을 때 나는 오류다. 무시해도 된다
    }
  }, [elapsedNow])

  const start = useCallback(() => {
    if (!getCtor()) {
      setError('이 브라우저는 받아쓰기를 지원하지 않습니다. 크롬이나 엣지에서 열어 주세요.')
      return
    }
    setError(null)
    restartsRef.current = []
    baseRef.current = 0
    startedRef.current = Date.now()
    wantRef.current = true
    setElapsedMs(0)
    setStage('꺼짐')
    setStatus('듣는중')
    spawn()
  }, [spawn])

  /**
   * 받아쓰기 장치는 안 켜고 **시간만** 센다.
   *
   * 「녹음해서 받아쓰기」 쪽에서 쓴다. 그쪽은 브라우저가 글로 바꾸지 않고
   * 녹음만 하지만, 흐른 시간과 「듣는 중」 표시는 똑같이 필요하다.
   */
  const startTimer = useCallback(() => {
    setError(null)
    restartsRef.current = []
    baseRef.current = 0
    startedRef.current = Date.now()
    wantRef.current = true
    setElapsedMs(0)
    setStage('꺼짐')
    setStatus('듣는중')
  }, [])

  const resumeTimer = useCallback(() => {
    setError(null)
    startedRef.current = Date.now()
    wantRef.current = true
    setStatus('듣는중')
  }, [])

  /** 마이크를 닫고 시간 계산을 멈춘다. 다시 켤 수 있게 남겨 둔다 */
  const halt = useCallback((next: LiveStatus) => {
    baseRef.current = wantRef.current ? baseRef.current + (Date.now() - startedRef.current) : baseRef.current
    wantRef.current = false
    setElapsedMs(baseRef.current)
    setStatus(next)
    setStage('꺼짐')
    setInterim('')
    try {
      recRef.current?.stop()
    } catch {
      // 이미 꺼져 있으면 무시
    }
  }, [])

  const pause = useCallback(() => halt('멈춤'), [halt])
  const stop = useCallback(() => halt('끝'), [halt])

  const resume = useCallback(() => {
    setError(null)
    restartsRef.current = []
    startedRef.current = Date.now()
    wantRef.current = true
    setStatus('듣는중')
    spawn()
  }, [spawn])

  const reset = useCallback(() => {
    wantRef.current = false
    baseRef.current = 0
    restartsRef.current = []
    try {
      recRef.current?.abort()
    } catch {
      // 무시
    }
    recRef.current = null
    setSegments([])
    setInterim('')
    setElapsedMs(0)
    setError(null)
    setStage('꺼짐')
    setStatus('준비')
  }, [])

  /** 브라우저에 저장해 둔 것을 되살릴 때 쓴다 */
  const restore = useCallback((saved: Segment[], ms: number) => {
    setSegments(saved)
    baseRef.current = ms
    setElapsedMs(ms)
    setStatus('끝')
  }, [])

  // 흐른 시간 표시. 0.5초마다 다시 그린다
  useEffect(() => {
    if (status !== '듣는중') return
    const id = setInterval(() => setElapsedMs(elapsedNow()), 500)
    return () => clearInterval(id)
  }, [status, elapsedNow])

  // 듣는 중에 창을 닫으면 회의가 통째로 날아간다. 한 번 물어본다
  useEffect(() => {
    if (status !== '듣는중') return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [status])

  // 화면을 떠나면 마이크를 반드시 닫는다. 안 닫으면 계속 듣는다
  useEffect(
    () => () => {
      wantRef.current = false
      try {
        recRef.current?.abort()
      } catch {
        // 무시
      }
    },
    [],
  )

  return {
    supported,
    secure,
    status,
    stage,
    segments,
    setSegments,
    interim,
    elapsedMs,
    error,
    clearError: () => setError(null),
    start,
    startTimer,
    resumeTimer,
    elapsedNow,
    pause,
    resume,
    stop,
    reset,
    restore,
  }
}
