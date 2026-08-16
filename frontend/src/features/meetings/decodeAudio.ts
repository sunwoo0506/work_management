/**
 * 올린 소리 파일을 **받아쓰기에 보낼 수 있는 토막**으로 바꾼다.
 *
 * ── 왜 그냥 못 보내나 ────────────────────────────────────
 * ① 한 번에 보낼 수 있는 크기가 정해져 있다. 한 시간짜리 녹음은 그걸 넘는다
 * ② 폰 녹음기가 만드는 형식(m4a 등)은 **가운데를 잘라내면 열리지 않는다.**
 *    앞머리에 「이 파일은 이런 형식이다」가 적혀 있어서, 그게 없는 조각은 파일이 아니다
 *
 * 그래서 **소리를 한 번 풀어서(디코딩) 다시 담는다.** 다시 담을 때는 wav 로 만든다 —
 * wav 는 만드는 규칙이 단순해서 딴 프로그램 없이 브라우저 안에서 바로 만들 수 있다.
 *
 * ── 왜 16kHz 한 줄(모노)로 줄이나 ────────────────────────
 * 받아쓰기에는 그 이상이 필요 없다. 음악이 아니라 말이기 때문이다.
 * 줄이면 크기가 10분의 1이 되어 올리는 시간과 요금이 크게 준다.
 */

/** 받아쓰기에 넉넉한 품질. 이 이상은 크기만 키운다 */
const TARGET_RATE = 16_000
/** 토막 하나의 길이. 5분이면 wav 로 약 9MB 라 한도 안에 든다 */
const CHUNK_SEC = 300

export type Decoded = {
  /** 16kHz 한 줄로 줄인 소리 값 */
  samples: Float32Array
  rate: number
  durationSec: number
}

/** 브라우저가 소리를 풀 수 있나 */
export function canDecode(): boolean {
  return typeof window !== 'undefined' && !!(window.AudioContext || 'webkitAudioContext' in window)
}

/**
 * 파일을 풀어 **16kHz 한 줄**로 만든다.
 *
 * ⚠️ 여기서 조각을 만들지 않는다. 한 시간짜리 녹음을 조각으로 다 만들어 들고 있으면
 *    **브라우저가 메모리로 뻗는다.** 실제로 100MB 짜리 파일이 문제가 됐다.
 *    조각은 보낼 때 하나씩 만들고, 보내고 나면 버린다 (makeChunk).
 */
export async function decodeToMono(
  file: File,
  onProgress?: (label: string) => void,
): Promise<Decoded> {
  onProgress?.('파일을 읽는 중')
  const bytes = await file.arrayBuffer()

  onProgress?.('소리를 푸는 중 (긴 파일은 1~2분 걸립니다)')
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  /*
    풀 때부터 16kHz 로 맞춘다. 브라우저가 푸는 김에 같이 줄여 주므로
    나중에 따로 줄이는 것보다 메모리를 훨씬 덜 쓴다.
  */
  const ctx = new Ctx({ sampleRate: TARGET_RATE })
  let audio: AudioBuffer
  try {
    audio = await ctx.decodeAudioData(bytes)
  } catch {
    throw new Error(
      '이 소리 파일을 풀지 못했습니다. 파일이 너무 크거나(1시간 30분 이상) ' +
        '브라우저가 모르는 형식일 수 있습니다. m4a · mp3 · wav 로, 길면 나눠서 올려 주세요.',
    )
  } finally {
    void ctx.close().catch(() => {})
  }

  const samples = toMono(audio)
  return { samples, rate: audio.sampleRate, durationSec: samples.length / audio.sampleRate }
}

/** 조각 하나를 그때그때 만든다. 보내고 나면 버려서 메모리를 안 쌓는다 */
export function makeChunk(d: Decoded, fromSec: number, toSec: number): Blob {
  const slice = d.samples.subarray(Math.floor(fromSec * d.rate), Math.floor(toSec * d.rate))
  return wav(slice, d.rate)
}

/** 이 길이면 몇 조각인가 */
export { CHUNK_SEC }

function toMono(buf: AudioBuffer): Float32Array {
  if (buf.numberOfChannels === 1) return buf.getChannelData(0)
  const out = new Float32Array(buf.length)
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c)
    for (let i = 0; i < buf.length; i++) out[i] += ch[i] / buf.numberOfChannels
  }
  return out
}

/**
 * wav 파일 한 개를 만든다.
 *
 * 앞의 44바이트가 「이 파일은 이런 소리다」를 적은 머리말이고, 그 뒤는 소리 값이다.
 * 규칙이 단순해서 딴 프로그램 없이 만들 수 있다 — 그래서 wav 를 골랐다.
 */
function wav(samples: Float32Array, rate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i))
  }

  text(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true) // 머리말 길이
  view.setUint16(20, 1, true) // 1 = 압축 안 함
  view.setUint16(22, 1, true) // 한 줄(모노)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true) // 초당 바이트
  view.setUint16(32, 2, true) // 한 칸 크기
  view.setUint16(34, 16, true) // 16비트
  text(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  // -1~1 을 16비트 정수로 옮긴다
  let at = 44
  for (let i = 0; i < samples.length; i++, at += 2) {
    const v = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(at, v < 0 ? v * 0x8000 : v * 0x7fff, true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

export type AudioMeta =
  | { ok: true; durationSec: number }
  | { ok: false; reason: string }

/**
 * 파일을 **풀지 않고** 길이만 알아본다.
 *
 * ── 왜 따로 두나 ─────────────────────────────────────────
 * 소리를 푸는 데 100MB 짜리는 1~2분이 걸린다. 그런데 사용자가 알아야 할 것
 * (형식이 맞나 · 얼마나 긴가 · 요금이 얼마인가)은 **푸는 것과 상관없이** 알 수 있다.
 *
 * 실제로 1시간 46분짜리 파일에서 2분을 기다린 끝에 「못 풀었습니다」가 떴다.
 * **판정을 먼저, 무거운 일은 사람이 승낙한 뒤에.**
 *
 * 브라우저에게 「이 파일 재생할 수 있어?」만 물어보므로 몇십 밀리초면 끝난다.
 */
export function readAudioMeta(file: File): Promise<AudioMeta> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const el = document.createElement('audio')
    el.preload = 'metadata'

    const finish = (r: AudioMeta) => {
      URL.revokeObjectURL(url)
      el.src = ''
      resolve(r)
    }

    el.onloadedmetadata = () => {
      const d = el.duration
      if (!Number.isFinite(d) || d <= 0) {
        finish({ ok: false, reason: '길이를 읽지 못했습니다. 파일이 깨졌을 수 있습니다.' })
      } else {
        finish({ ok: true, durationSec: d })
      }
    }
    el.onerror = () =>
      finish({
        ok: false,
        reason: '이 브라우저가 모르는 소리 형식입니다. m4a · mp3 · wav · webm 으로 올려 주세요.',
      })

    // 10초 안에 답이 없으면 못 읽는 것으로 본다
    setTimeout(() => finish({ ok: false, reason: '파일을 읽는 데 너무 오래 걸립니다.' }), 10_000)
    el.src = url
  })
}

/**
 * 이 길이를 브라우저가 풀 수 있을 만한가.
 *
 * 푸는 순간 소리 전체가 메모리에 올라간다. 1분에 약 4MB(16kHz) 라
 * **한 시간을 넘어가면 위험**해지고, 두 시간이면 대개 실패한다.
 * 실제로 1시간 46분짜리에서 실패했다.
 */
export function decodeRisk(durationSec: number): '안전' | '주의' | '위험' {
  const min = durationSec / 60
  if (min <= 60) return '안전'
  if (min <= 100) return '주의'
  return '위험'
}
