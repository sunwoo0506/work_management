import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 녹음해서 받아쓰기 — 폰·태블릿에서 확실하게 도는 쪽.
 *
 * ── 왜 두 번째 길을 만들었나 ─────────────────────────────
 * 브라우저 내장 받아쓰기는 **폰에서 잘 안 된다.** 실제로 폰에서 눌렀는데
 * 글자가 하나도 안 올라왔다. 삼성 인터넷에는 그 기능이 아예 없고,
 * 안드로이드 크롬은 한 마디마다 끊긴다.
 *
 * 이 길은 브라우저가 **녹음만** 한다. 글로 바꾸는 일은 서버(Edge Function)가 한다.
 * 녹음은 어느 폰에서도 되는 기본 기능이라 **기기를 안 가린다.**
 *
 * ── 왜 토막을 내나 ───────────────────────────────────────
 * 한 시간을 통째로 두면 회의가 끝날 때까지 글자를 한 자도 못 본다.
 * **토막마다 글이 돌아오므로 회의 중에 쌓이는 것이 보인다.**
 *
 * ⚠️ 토막을 「이어지는 조각」으로 받지 않고 **매번 새로 시작한다.**
 *    녹음 형식(webm)은 맨 앞에 머리말이 있어야 열리는데, 이어지는 조각에는
 *    그 머리말이 없어 **두 번째 토막부터 통째로 못 읽는다.**
 *    멈췄다 다시 시작하면 토막마다 완전한 파일이 된다.
 */

/**
 * 토막 길이 — **2026-08-19 에 45초에서 15초로 줄였다.**
 *
 * ── 왜 줄였나 ────────────────────────────────────────────
 * 부장님이 *"음성 받아쓰기가 안 된다"* 고 하셨다. 실은 되고 있었다.
 * **45초 동안 글자가 한 자도 안 올라와서 고장 난 줄 아신 것**이다.
 * 소리 막대는 움직이지만 그건 「마이크가 살아 있다」는 증거일 뿐,
 * 「받아쓰기가 되고 있다」는 증거가 아니다. **사람이 믿는 것은 글자다.**
 *
 * ── 왜 그냥 다 짧게 하지 않나 ────────────────────────────
 * 토막을 자르는 자리에서 **말이 잘린다.** 잘린 단어는 양쪽 토막에서 다 틀리게
 * 적힌다. 45분 회의면 45초 토막은 60번, 15초 토막은 180번 잘린다.
 * 짧게 할수록 자주 보이지만 **그만큼 더 틀린다.**
 *
 * 요금은 거의 안 는다 — 받아쓰기 값은 **소리의 길이**로 매겨지지 호출 횟수로
 * 매겨지지 않는다. 그래서 이 선택은 「돈」이 아니라 **「빨리 보기 ↔ 정확도」**다.
 * 15초면 한국어 문장 두세 개가 들어가 문맥이 크게 깨지지 않는다.
 */
const CHUNK_MS = 15_000

/**
 * **첫 토막만 더 짧게 간다.**
 *
 * 처음 한 번은 목적이 다르다 — 받아쓴 글을 얻는 게 아니라 **「되고 있다」를
 * 보여 주는 것**이다. 그건 6초면 된다. 회의가 시작되고 나면 그 조바심은
 * 사라지고 정확도가 중요해지므로 그다음부터는 위 길이로 돌아간다.
 */
const FIRST_CHUNK_MS = 6_000

/**
 * 이 소리보다 조용한 토막은 **보내지 않는다.**
 *
 * ── 왜 ───────────────────────────────────────────────────
 * 받아쓰기 모델은 유튜브 자막을 보고 배웠다. **소리가 없는 토막**을 받으면
 * 빈 답을 내는 대신 자막에서 흔한 문장을 지어낸다 —
 * 「시청해주셔서 감사합니다」가 회의록에 들어온 이유다(2026-08-19).
 *
 * 토막을 15초로 줄이면서 **말 없는 토막이 늘었고 그만큼 자주 나왔다.**
 * 지어낸 글을 나중에 거르는 것보다 **애초에 안 보내는 쪽이 확실하다.**
 * 요금도 그만큼 안 나간다.
 *
 * ── 값을 왜 이렇게 낮게 잡았나 ───────────────────────────
 * 잘못 버리면 **사람이 한 말이 사라진다.** 회의실은 넓고 말하는 사람이
 * 멀리 있을 수 있다. 그래서 **확실히 조용할 때만** 버리도록 낮게 잡았다.
 * 이 그물을 빠져나온 것은 글에서 한 번 더 거른다(domain/hallucination.ts).
 */
const SILENCE_PEAK = 0.05

export type RecorderStatus = '준비' | '녹음중' | '멈춤'

/**
 * @param chunkMs 토막 길이. **0 이면 끊지 않고 끝까지 한 파일로 담는다.**
 *
 *   0 을 쓰는 자리 — 브라우저 받아쓰기(⚡)를 쓸 때의 **안전망 녹음**이다.
 *   받아쓰기가 글자를 못 내놓으면 그동안 한 말이 통째로 사라진다. 소리라도
 *   남겨 두면 나중에 내려받아 다른 방법으로 글로 바꿀 수 있다.
 *   이때는 서버로 보내지 않으므로 요금도 0원이고 밖으로도 안 나간다.
 */
export function useRecorder(
  onChunk: (blob: Blob, atMs: number) => void,
  chunkMs: number = CHUNK_MS,
  /**
   * 소리 크기를 잴 것인가.
   *
   * **끄면 화면이 훨씬 덜 그려진다.** 재는 일은 초당 60번 돌면서 그때마다
   * 화면을 다시 그리게 만든다. 안전망 녹음기처럼 **막대를 안 보여 주고
   * 무음도 안 가리는** 자리에서는 순전히 낭비다.
   *
   * 실제로 2026-08-19 에 녹음 길에도 안전망 녹음기를 붙이면서, 녹음기 두 대가
   * 각각 재기 시작해 **화면이 두 배로 그려질 뻔했다.**
   */
  meter: boolean = true,
) {
  /*
    넘겨받은 함수를 그릇(ref)에 담아 둔다.
    녹음이 도는 동안 화면이 다시 그려지면 이 함수는 새것으로 바뀌는데,
    녹음기 안쪽은 **처음 받은 함수를 붙들고 있다.** 그러면 나중에 만든 토막이
    옛 함수로 흘러가 화면에 안 붙는다. 그릇을 두면 항상 최신 것을 부른다
  */
  const onChunkRef = useRef(onChunk)
  onChunkRef.current = onChunk
  const [status, setStatus] = useState<RecorderStatus>('준비')
  const [error, setError] = useState<string | null>(null)
  /** 지금 마이크에 잡히는 소리 크기 (0~1). 마이크가 살아 있다는 증거 */
  const [level, setLevel] = useState(0)
  /**
   * 다음 글이 올라오기까지 남은 초.
   *
   * **이게 없으면 기다리는 시간이 「고장 난 시간」이 된다.** 소리 막대는
   * 마이크가 산 것만 알려 준다. 얼마나 더 기다리면 되는지는 말해 주지 않는다.
   */
  const [nextInSec, setNextInSec] = useState(0)
  /** 조용해서 안 보낸 토막 수. 「왜 글이 안 늘지?」의 답이 되어야 한다 */
  const [skippedQuiet, setSkippedQuiet] = useState(0)

  const streamRef = useRef<MediaStream | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const timerRef = useRef<number | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number | null>(null)
  const wantRef = useRef(false)
  /** 이 토막이 시작된 시각 (회의 시작으로부터 흐른 ms) */
  const chunkAtRef = useRef(0)
  /** 아직 첫 토막인가 — 첫 번째만 짧게 끊는다 */
  const firstRef = useRef(true)
  /** 지금 토막이 끝날 벽시계 시각. 남은 초를 세는 데 쓴다 */
  const endsAtRef = useRef(0)
  /** 지금 토막에서 가장 컸던 소리 (0~1) */
  const chunkPeakRef = useRef(0)
  const elapsedRef = useRef<() => number>(() => 0)

  const supported =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'

  /** 브라우저마다 되는 형식이 다르다. 되는 것 중 첫 번째를 쓴다 */
  const pickMime = useCallback((): string | undefined => {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
    ]
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported?.(c)) return c
    }
    return undefined
  }, [])

  /** 소리 크기를 계속 재서 화면에 막대로 보여 준다 */
  const watchLevel = useCallback((stream: MediaStream) => {
    try {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      const ctx = new Ctx()
      audioCtxRef.current = ctx
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      src.connect(analyser)
      const buf = new Uint8Array(analyser.frequencyBinCount)

      const tick = () => {
        analyser.getByteTimeDomainData(buf)
        let peak = 0
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128))
        const lv = Math.min(1, peak / 60)
        setLevel(lv)
        // 이 토막에서 가장 컸던 소리. 「말이 있었나」를 판단하는 근거다
        if (lv > chunkPeakRef.current) chunkPeakRef.current = lv
        rafRef.current = requestAnimationFrame(tick)
      }
      tick()
    } catch {
      // 소리 크기 표시는 있으면 좋은 것이지 없으면 안 되는 것이 아니다.
      // 여기서 죽으면 녹음 자체가 안 되므로 조용히 넘어간다
    }
  }, [])

  /** 토막 하나를 녹음하고 끝나면 넘긴다. 그리고 다시 시작한다 */
  const spin = useCallback(() => {
    const stream = streamRef.current
    if (!stream || !wantRef.current) return

    const mime = pickMime()
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    const parts: Blob[] = []
    chunkAtRef.current = elapsedRef.current()
    chunkPeakRef.current = meter ? 0 : 1

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) parts.push(e.data)
    }
    rec.onstop = () => {
      const at = chunkAtRef.current
      const loudest = chunkPeakRef.current
      if (parts.length > 0) {
        const blob = new Blob(parts, { type: parts[0].type || mime || 'audio/webm' })
        // 너무 짧은 토막(1초 미만)은 보내지 않는다 — 요금만 나가고 글은 안 나온다
        const 들을만한가 = blob.size > 4_000
        // 아무 말도 없던 토막은 보내지 않는다 — 보내면 없는 말을 지어낸다
        const 소리가있었나 = chunkMs === 0 || loudest >= SILENCE_PEAK
        if (들을만한가 && 소리가있었나) onChunkRef.current(blob, at)
        else if (들을만한가) setSkippedQuiet((n) => n + 1)
      }
      // 사람이 멈춘 게 아니면 곧바로 다음 토막을 시작한다
      if (wantRef.current) spin()
    }

    recRef.current = rec
    rec.start()
    // 0 이면 시계를 걸지 않는다 — 사람이 「끝내기」를 누를 때까지 한 파일로 담는다
    if (chunkMs > 0) {
      // 첫 토막만 짧게. 「되고 있다」를 빨리 보여 주는 것이 목적이다
      const len = firstRef.current ? Math.min(FIRST_CHUNK_MS, chunkMs) : chunkMs
      firstRef.current = false
      endsAtRef.current = Date.now() + len
      setNextInSec(Math.ceil(len / 1000))

      timerRef.current = window.setTimeout(() => {
        try {
          if (rec.state !== 'inactive') rec.stop()
        } catch {
          // 이미 멈춰 있으면 무시
        }
      }, len)
    }
  }, [pickMime, chunkMs, meter])

  const start = useCallback(
    async (elapsed: () => number) => {
      if (!supported) {
        setError('이 브라우저는 녹음을 지원하지 않습니다.')
        return false
      }
      setError(null)
      elapsedRef.current = elapsed
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            // 회의실은 소리가 울리고 멀다. 브라우저가 다듬어 주는 것을 다 켠다
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        })
        streamRef.current = stream
        wantRef.current = true
        // 안 재는 자리에서는 「소리가 있었다」로 둔다 — 안 그러면 전부 조용한 것으로 보고 안 보낸다
        if (!meter) chunkPeakRef.current = 1
        // 멈췄다 다시 시작해도 첫 토막은 짧게 — 그때도 「되나?」가 다시 궁금해진다
        firstRef.current = true
        setSkippedQuiet(0)
        if (meter) watchLevel(stream)
        spin()
        setStatus('녹음중')
        return true
      } catch (e) {
        const name = (e as { name?: string })?.name
        setError(
          name === 'NotAllowedError'
            ? '마이크 사용이 막혀 있습니다. 주소창 왼쪽 자물쇠(또는 ⋮ 메뉴)에서 마이크를 허용해 주세요.'
            : name === 'NotFoundError'
              ? '마이크를 찾지 못했습니다.'
              : '마이크를 열지 못했습니다. 다른 앱이 마이크를 쓰고 있는지 확인해 주세요.',
        )
        return false
      }
    },
    [supported, watchLevel, spin, meter],
  )

  /** 멈춘다. 녹음 중이던 토막도 끝내서 넘긴다 (그 부분이 사라지지 않게) */
  const stop = useCallback(() => {
    wantRef.current = false
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    try {
      if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop()
    } catch {
      // 무시
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    void audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setLevel(0)
    setNextInSec(0)
    setStatus('멈춤')
  }, [])

  /**
   * 남은 초를 1초마다 센다.
   *
   * 소리 막대와 달리 이건 **초 단위로만** 바뀌므로 화면을 자주 다시 그리지 않는다.
   * 녹음 중이 아닐 때는 시계를 아예 걸지 않는다.
   */
  useEffect(() => {
    if (status !== '녹음중' || chunkMs <= 0) {
      setNextInSec(0)
      return
    }
    const id = window.setInterval(() => {
      setNextInSec(Math.max(0, Math.ceil((endsAtRef.current - Date.now()) / 1000)))
    }, 500)
    return () => clearInterval(id)
  }, [status, chunkMs])

  // 화면을 떠나면 마이크를 반드시 끈다. 안 끄면 계속 녹음된다
  useEffect(() => () => {
    wantRef.current = false
    if (timerRef.current) clearTimeout(timerRef.current)
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    void audioCtxRef.current?.close().catch(() => {})
    streamRef.current?.getTracks().forEach((t) => t.stop())
  }, [])

  return {
    supported,
    status,
    level,
    /** 다음 글이 올라오기까지 남은 초 */
    nextInSec,
    /** 토막 길이(초). 화면이 「몇 초마다 올라온다」를 안내할 때 쓴다 */
    chunkSec: Math.round(chunkMs / 1000),
    /** 조용해서 안 보낸 토막 수 */
    skippedQuiet,
    error,
    start,
    stop,
    clearError: () => setError(null),
  }
}
