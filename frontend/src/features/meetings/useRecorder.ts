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

/** 토막 길이. 짧으면 자주 보이지만 호출이 늘고, 길면 뜸하게 보인다 */
const CHUNK_MS = 45_000

export type RecorderStatus = '준비' | '녹음중' | '멈춤'

export function useRecorder(onChunk: (blob: Blob, atMs: number) => void) {
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
  /** 지금 마이크에 잡히는 소리 크기 (0~1). **듣고 있다는 유일한 증거다** */
  const [level, setLevel] = useState(0)

  const streamRef = useRef<MediaStream | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const timerRef = useRef<number | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number | null>(null)
  const wantRef = useRef(false)
  /** 이 토막이 시작된 시각 (회의 시작으로부터 흐른 ms) */
  const chunkAtRef = useRef(0)
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
        setLevel(Math.min(1, peak / 60))
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

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) parts.push(e.data)
    }
    rec.onstop = () => {
      const at = chunkAtRef.current
      if (parts.length > 0) {
        const blob = new Blob(parts, { type: parts[0].type || mime || 'audio/webm' })
        // 너무 짧은 토막(1초 미만)은 보내지 않는다 — 요금만 나가고 글은 안 나온다
        if (blob.size > 4_000) onChunkRef.current(blob, at)
      }
      // 사람이 멈춘 게 아니면 곧바로 다음 토막을 시작한다
      if (wantRef.current) spin()
    }

    recRef.current = rec
    rec.start()
    timerRef.current = window.setTimeout(() => {
      try {
        if (rec.state !== 'inactive') rec.stop()
      } catch {
        // 이미 멈춰 있으면 무시
      }
    }, CHUNK_MS)
  }, [pickMime])

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
        watchLevel(stream)
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
    [supported, watchLevel, spin],
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
    setStatus('멈춤')
  }, [])

  // 화면을 떠나면 마이크를 반드시 끈다. 안 끄면 계속 녹음된다
  useEffect(() => () => {
    wantRef.current = false
    if (timerRef.current) clearTimeout(timerRef.current)
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    void audioCtxRef.current?.close().catch(() => {})
    streamRef.current?.getTracks().forEach((t) => t.stop())
  }, [])

  return { supported, status, level, error, start, stop, clearError: () => setError(null) }
}
