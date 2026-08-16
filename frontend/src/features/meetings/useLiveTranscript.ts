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

/**
 * 받아쓰기 장치를 고른다.
 *
 * ── 크롬에는 장치가 **두 개** 있다 ───────────────────────
 *   webkitSpeechRecognition  10년 넘게 쓰인 것. 제조사 서버가 받아써 준다
 *   SpeechRecognition        나중에 생긴 표준 이름
 *
 * 처음에는 「표준」을 먼저 집었다. 이름이 표준이니 그게 맞다고 본 것이다.
 * **그게 틀렸다.** 실제로 점검해 보니 표준 쪽은 마이크를 열고 소리까지 받아 놓고
 * **글자를 한 자도 안 돌려줬다** — 오류조차 안 냈다 (2026-08-16, Chrome 151).
 *
 * 새 이름이 붙었다고 뒤에서 같은 일을 하는 게 아니었다.
 * 그래서 **오래 검증된 쪽(webkit)을 먼저** 쓰고, 없을 때만 표준을 쓴다.
 *
 * @param swapped 그래도 안 되면 순서를 바꿔 다른 쪽을 써 본다
 */
function getCtor(swapped = false): SRCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor }
  const order = swapped
    ? [w.SpeechRecognition, w.webkitSpeechRecognition]
    : [w.webkitSpeechRecognition, w.SpeechRecognition]
  return order.find(Boolean) ?? null
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
  /**
   * 아직 확정되지 않은, 지금 듣는 중인 말.
   *
   * ── 왜 그릇에 따로 담나 ─────────────────────────────────
   * 받아쓰기는 말이 끝나야 그 문장을 **확정**한다. 확정 전 글은 화면에 흐리게만 있다가
   * **한 판이 끝나면 통째로 사라진다.** 그런데 우리는 조용해질 때마다 판을 새로 켠다.
   * 그래서 *"말을 자꾸 지워버린다"* 가 됐다 — 화면에 떴다가 없어지는 그 글이다.
   *
   * 판이 끝날 때 이 그릇에 남은 말을 **확정으로 굳혀서 줄에 담는다.** 그러면 안 사라진다.
   */
  const interimRef = useRef('')
  /** 글자가 한 번이라도 나왔나. 나왔으면 방식을 바꾸지 않는다 */
  const sawResultRef = useRef(false)
  /** 이번 판을 켠 시각. 켜자마자 끝나는 것과 한 마디 하고 끝나는 것을 가른다 */
  const spawnedAtRef = useRef(0)
  /**
   * 「한 마디씩」으로 갈아탔나.
   *
   * 이어 듣기(continuous)가 **소리는 잡는데 글자를 안 내놓는** 브라우저가 있다.
   * 실제로 노트북에서 「말소리 감지됨」까지 가고 멈췄다. 그럴 때 한 마디씩 끊어
   * 받는 방식으로 바꾸면 나오는 경우가 있어서, **스스로 한 번 갈아타 본다.**
   */
  const phraseRef = useRef(false)
  /** 받아쓰기 장치를 다른 쪽으로 바꿔 봤나 (webkit ↔ 표준) */
  const swappedRef = useRef(false)
  /** 마지막으로 받은 신호(오류 코드 등). 안 될 때 무엇 때문인지 보여 준다 */
  const [signal, setSignal] = useState<string | null>(null)
  /**
   * **우리가 스스로 끊었나.**
   *
   * 방식을 바꾸려고 `abort()` 를 부르면 브라우저가 `aborted` 오류를 준다.
   * 그걸 그대로 화면에 띄웠더니 사용자에게 **「신호: aborted」** 로 보였다 —
   * 진짜 원인인 줄 알게 만드는, 우리가 만든 잡음이다. 그래서 표시하지 않는다.
   */
  const selfAbortRef = useRef(false)
  /** 받아쓰기 장치를 몇 번 켰나. 「몇 번 해 봤는데 안 된다」를 보여 준다 */
  const [attempts, setAttempts] = useState(0)

  const supported = getCtor() !== null
  // 마이크는 https 또는 localhost 에서만 열린다
  const secure = typeof window === 'undefined' || window.isSecureContext

  const elapsedNow = useCallback(
    () => baseRef.current + (wantRef.current ? Date.now() - startedRef.current : 0),
    [],
  )

  const spawn = useCallback(() => {
    const Ctor = getCtor(swappedRef.current)
    if (!Ctor) return

    const rec = new Ctor()
    rec.lang = 'ko-KR'
    // 이어 듣기가 안 먹는 브라우저에서는 한 마디씩 받는다 (아래 phraseRef 설명)
    rec.continuous = !phraseRef.current
    rec.interimResults = true
    rec.maxAlternatives = 1
    spawnedAtRef.current = Date.now()
    setAttempts((n) => n + 1)

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
        setSignal(null)
        sawResultRef.current = true
        // 글자가 나왔으면 그동안의 「자꾸 끊긴다」 셈을 지운다.
        // 안드로이드는 한 마디마다 끊었다 다시 켜는 것이 **정상 동작**이라,
        // 지우지 않으면 잘 되고 있는데도 「계속 끊긴다」로 판정해 멈춰 버린다
        restartsRef.current = []
      }
      if (final.trim()) {
        interimRef.current = ''
        setSegments((prev) => appendFinal(prev, final, at))
      } else {
        interimRef.current = live.trim()
      }
      setInterim(live.trim())
    }

    rec.onerror = (e) => {
      if (e.error === 'aborted' && selfAbortRef.current) {
        // 우리가 끊은 것이다. 오류가 아니다
        selfAbortRef.current = false
        return
      }
      // 삼켜 버리던 신호도 화면에는 남긴다. *"왜 안 되는지 모르겠다"* 를 없애는 자리다
      if (e.error !== 'no-speech') setSignal(e.error)
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
        // 바로 멈추지 않는다. 잠깐 끊겼다 붙는 일이 잦아서 onend 가 다시 켜 준다.
        // 계속 나면 아래 「연달아 실패」 판정에 걸려 멈춘다
        setError('받아쓰기 서버 연결이 끊겼습니다. 다시 붙는 중입니다…')
      } else {
        setError(`받아쓰기가 멈췄습니다 (${e.error}).`)
      }
    }

    rec.onend = () => {
      /*
        ⚠️ 판이 끝나면 **듣던 말이 사라진다.** 확정 전 글은 브라우저가 안 들고 있다.
        그래서 여기서 굳혀 담는다. 이걸 안 하면 조용해질 때마다 방금 한 말이 지워진다.
      */
      const pending = interimRef.current.trim()
      if (pending) {
        interimRef.current = ''
        const at = elapsedNow()
        setSegments((prev) => appendFinal(prev, pending, at))
        setInterim('')
      }

      if (!wantRef.current) return

      const now = Date.now()
      // 켜자마자(1.5초 안에) 끝난 것만 「이상하다」로 센다.
      // 한 마디 하고 끝나는 것은 안드로이드·한 마디 모드에서 **정상 동작**이다
      if (now - spawnedAtRef.current > 1_500) restartsRef.current = []
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
    setSignal(null)
    setAttempts(0)
    phraseRef.current = false
    swappedRef.current = false
    sawResultRef.current = false
    interimRef.current = ''
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
    setSignal(null)
    phraseRef.current = false
    setStatus('준비')
  }, [])

  /** 브라우저에 저장해 둔 것을 되살릴 때 쓴다 */
  const restore = useCallback((saved: Segment[], ms: number) => {
    setSegments(saved)
    baseRef.current = ms
    setElapsedMs(ms)
    setStatus('끝')
  }, [])

  /**
   * 글자가 없는 채로 시간이 얼마나 흘렀나 — **세기만 한다.**
   *
   * ── 예전에는 여기서 스스로 방식을 바꿨다. 그걸 다 걷어냈다 ──
   * 15초에 「한 마디씩」으로, 30초에 「다른 장치」로 자동으로 갈아탔다.
   * 좋은 뜻이었지만 **갈아탈 때마다 판을 끊었고, 끊으면 듣던 말이 날아갔다.**
   * 그래서 받아쓰기가 되기 시작한 뒤에도 *"말을 자꾸 지워버린다"*,
   * *"30초쯤 멈춘다"* 가 났다.
   *
   * **툴이 알아서 끊는 것이 사람이 겪는 문제보다 컸다.** 그래서 세기만 하고,
   * 바꾸는 것은 사람이 버튼으로 한다. 잘 되고 있는 판은 아무도 안 건드린다.
   */
  const [noTextSec, setNoTextSec] = useState(0)

  useEffect(() => {
    if (status !== '듣는중' || segments.length > 0) {
      setNoTextSec(0)
      return
    }
    const started = Date.now()
    const id = setInterval(() => setNoTextSec(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(id)
  }, [status, segments.length])

  /**
   * 「한 마디씩」 방식으로 바꾼다 — **사람이 누를 때만.**
   * 이어 듣기가 안 먹는 환경에서 쓴다. 지금 판을 끊고 새 방식으로 다시 켠다.
   */
  const switchToPhrase = useCallback(() => {
    if (phraseRef.current) return
    phraseRef.current = true
    setSignal('「한 마디씩」 방식으로 바꿨습니다')
    selfAbortRef.current = true
    try {
      recRef.current?.abort()
    } catch {
      // 무시 — onend 가 다시 켠다
    }
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
    signal,
    attempts,
    switchToPhrase,
    /** 지금 「한 마디씩」 방식으로 듣고 있나 */
    phrase: phraseRef.current,
    /** 글자가 한 줄도 안 나온 채 흐른 시간(초) */
    noTextSec,
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
