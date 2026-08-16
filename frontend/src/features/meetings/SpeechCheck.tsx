import { useRef, useState } from 'react'
import { Card } from '../../components/ui'
import { PillButton } from '../../components/Field'

/**
 * 받아쓰기 점검 — **어디서 죽는지 눈으로 본다.**
 *
 * ── 왜 만들었나 ──────────────────────────────────────────
 * 「소리는 들어오는데 글자가 안 나온다」가 며칠째 안 풀렸다. 원인 후보가 여럿인데
 * (브라우저가 흉내만 냄 / 회사망이 막음 / 마이크 문제 / 내 코드 문제)
 * **화면에 보이는 게 없어서 계속 짐작만 했다.**
 *
 * 받아쓰기 장치는 단계마다 신호를 준다. 그 신호를 **시각과 함께 그대로 적어**
 * 보여 주면, 어디까지 갔다가 멈추는지가 드러난다.
 *
 *   start → audiostart → soundstart → speechstart → **result** → end
 *                                          ↑ 여기까지 오고 result 가 없으면
 *                                            받아쓰기 서비스가 답을 안 주는 것이다
 *
 * ⚠️ 이 점검은 **10초만** 돈다. 회의를 방해하지 않는다.
 */

type Ev = { at: number; what: string }

type SRLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onstart: (() => void) | null
  onaudiostart: (() => void) | null
  onsoundstart: (() => void) | null
  onspeechstart: (() => void) | null
  onspeechend: (() => void) | null
  onsoundend: (() => void) | null
  onaudioend: (() => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
  onresult: ((e: { results: { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } } }) => void) | null
}

export default function SpeechCheck() {
  const [running, setRunning] = useState(false)
  const [events, setEvents] = useState<Ev[]>([])
  const [copied, setCopied] = useState(false)
  const recRef = useRef<SRLike | null>(null)

  const w = window as unknown as {
    SpeechRecognition?: new () => SRLike
    webkitSpeechRecognition?: new () => SRLike
  }
  /**
   * 크롬에는 받아쓰기 장치가 **두 개** 있고, 둘이 다르게 동작한다.
   * 실제로 「표준」 쪽이 소리만 받고 글자를 안 돌려준 일이 있었다 (2026-08-16).
   * 그래서 **어느 쪽을 시험할지 골라서** 돌린다.
   */
  /**
   * ── 한국어 받아쓰기 자료가 이 컴퓨터에 있는가 ────────────
   *
   * 요즘 크롬은 받아쓰기를 **컴퓨터 안에서** 하는 쪽으로 옮겨 가고 있다.
   * 그러려면 언어별 자료(모델)를 한 번 내려받아야 하는데, **그게 없으면
   * 마이크는 열리고 소리도 받으면서 글자만 영영 안 나온다** — 오류도 안 낸다.
   * 우리가 겪은 증상과 정확히 같다 (2026-08-16, Chrome 151).
   *
   * 상태는 넷이다: available(됨) / downloadable(내려받으면 됨) /
   * downloading(받는 중) / unavailable(이 컴퓨터에선 안 됨).
   *
   * ⚠️ 아주 최근에 생긴 기능이라 없는 브라우저도 많다. 없으면 조용히 넘어간다.
   */
  const [packStatus, setPackStatus] = useState<string | null>(null)
  const [installing, setInstalling] = useState(false)
  /**
   * 어느 말로 시험할까.
   *
   * 한국어만 안 되는 경우가 있는지 가르려고 둔다. 영어로는 글자가 나오는데
   * 한국어만 안 나오면 **언어 문제**이고, 둘 다 안 나오면 **서비스 문제**다.
   */
  const [lang, setLang] = useState<'ko-KR' | 'en-US'>('ko-KR')
  /** 마이크에 실제로 소리가 들어오는지. 「말했는데 안 들어간」 경우를 가른다 */
  const [micInfo, setMicInfo] = useState<{ name: string; peak: number } | null>(null)
  const hasWebkit = !!w.webkitSpeechRecognition
  const hasStd = !!w.SpeechRecognition
  const Ctor = w.webkitSpeechRecognition ?? w.SpeechRecognition
  const which = `webkit ${hasWebkit ? '있음' : '없음'} · 표준 ${hasStd ? '있음' : '없음'}`

  /**
   * 마이크에 소리가 얼마나 들어오는지 3초간 재 본다.
   *
   * 받아쓰기 장치는 **소리가 들어왔다는 신호는 주지만 얼마나 큰지는 안 알려 준다.**
   * 아주 작은 소리(멀리 있는 마이크·음소거 직전)에도 「말소리로 판단」이 뜬다.
   * 그래서 따로 잰다 — 목소리가 안 들어가는 것과 받아쓰기가 안 되는 것은 다른 문제다.
   */
  /** 한국어 자료가 있는지 물어본다 */
  async function askPack(): Promise<string | null> {
    const SR = w.SpeechRecognition as unknown as {
      available?: (o: { langs: string[]; processLocally: boolean }) => Promise<string>
    }
    if (typeof SR?.available !== 'function') {
      setPackStatus('이 브라우저에는 확인 기능이 없음')
      return null
    }
    try {
      const local = await SR.available({ langs: [lang], processLocally: true })
      const server = await SR.available({ langs: [lang], processLocally: false })
      const label = `컴퓨터 안: ${local} · 서버 이용: ${server}`
      setPackStatus(label)
      return local
    } catch (e) {
      setPackStatus(`확인 실패 — ${e instanceof Error ? e.message : String(e)}`)
      return null
    }
  }

  /** 한국어 자료를 내려받는다. 몇 십 MB 라 한 번만 받으면 된다 */
  async function installPack() {
    const SR = w.SpeechRecognition as unknown as {
      install?: (o: { langs: string[]; processLocally: boolean }) => Promise<boolean>
    }
    if (typeof SR?.install !== 'function') return
    setInstalling(true)
    try {
      const ok = await SR.install({ langs: [lang], processLocally: true })
      setPackStatus(ok ? '내려받았습니다. 다시 점검해 보세요' : '내려받지 못했습니다')
    } catch (e) {
      setPackStatus(`내려받기 실패 — ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setInstalling(false)
      void askPack()
    }
  }

  async function checkMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const name = stream.getAudioTracks()[0]?.label || '이름 없는 마이크'
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      let peak = 0
      if (Ctx) {
        const ctx = new Ctx()
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        ctx.createMediaStreamSource(stream).connect(analyser)
        const buf = new Uint8Array(analyser.frequencyBinCount)
        const until = Date.now() + 3000
        while (Date.now() < until) {
          analyser.getByteTimeDomainData(buf)
          for (const v of buf) peak = Math.max(peak, Math.abs(v - 128))
          await new Promise((r) => setTimeout(r, 50))
        }
        await ctx.close().catch(() => {})
      }
      stream.getTracks().forEach((t) => t.stop())
      setMicInfo({ name, peak: Math.round((peak / 128) * 100) })
    } catch (e) {
      setMicInfo({ name: `열지 못함 — ${e instanceof Error ? e.message : String(e)}`, peak: 0 })
    }
  }

  async function run() {
    if (!Ctor) return
    setEvents([])
    setCopied(false)
    setMicInfo(null)
    setRunning(true)

    /*
      ⚠️ 마이크 확인을 **먼저 끝내고** 받아쓰기를 시작한다.
      둘을 같이 열었더니 서로 마이크를 잡으려 다투어 「마이크가 안 열린다」가 떴다.
      순서를 지키면 둘 다 정상으로 열린다.
    */
    await checkMic()
    await askPack()

    const t0 = Date.now()
    const log = (what: string) =>
      setEvents((p) => [...p, { at: Date.now() - t0, what }])

    const rec = new Ctor()
    recRef.current = rec
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true

    rec.onstart = () => log('start — 받아쓰기 장치 켜짐')
    rec.onaudiostart = () => log('audiostart — 마이크 열림')
    rec.onsoundstart = () => log('soundstart — 소리 들어옴')
    rec.onspeechstart = () => log('speechstart — 말소리로 판단')
    rec.onspeechend = () => log('speechend — 말이 끊김')
    rec.onsoundend = () => log('soundend — 소리 끊김')
    rec.onaudioend = () => log('audioend — 마이크 닫힘')
    rec.onerror = (e) => log(`error: ${e.error}`)
    rec.onresult = (e) => {
      const last = e.results[e.results.length - 1]
      const text = last?.[0]?.transcript ?? ''
      log(`★ result (${last?.isFinal ? '확정' : '듣는 중'}) — "${text.slice(0, 40)}"`)
    }
    rec.onend = () => {
      log('end — 끝남')
      setRunning(false)
    }

    try {
      rec.start()
    } catch (e) {
      log(`start 실패: ${e instanceof Error ? e.message : String(e)}`)
      setRunning(false)
    }

    setTimeout(() => {
      try {
        recRef.current?.stop()
      } catch {
        // 이미 꺼졌으면 무시
      }
    }, 10_000)
  }

  const got = events.some((e) => e.what.startsWith('★'))
  const heard = events.some((e) => e.what.startsWith('soundstart') || e.what.startsWith('speechstart'))
  const mic = events.some((e) => e.what.startsWith('audiostart'))
  const netError = events.some((e) => e.what.includes('network'))
  const denied = events.some((e) => e.what.includes('not-allowed'))

  /** 무엇이 문제인지 한 줄로 못 박는다. 점검의 값어치는 여기에 있다 */
  const verdict = (): string | null => {
    if (events.length === 0) return null
    if (got) return '✅ 정상입니다. 이 브라우저에서 받아쓰기가 됩니다.'
    if (denied) return '❌ 마이크가 막혀 있습니다. 주소창 왼쪽에서 마이크를 허용해 주세요.'
    if (netError)
      return '❌ 받아쓰기 서버에 못 닿습니다. 회사 네트워크나 보안 프로그램이 막고 있을 수 있습니다. 휴대폰 테더링으로 한 번 해 보세요.'
    if (!mic) return '❌ 마이크가 안 열립니다. 다른 앱이 마이크를 쓰고 있는지 확인해 주세요.'
    if (micInfo && micInfo.peak < 5)
      return `❌ 마이크에 소리가 거의 안 들어옵니다 (최대 ${micInfo.peak}%). 입력 장치가 맞는지, 음소거가 아닌지 확인해 주세요. 받아쓰기 문제가 아닙니다.`
    if (heard)
      return packStatus && /downloadable|downloading|unavailable/.test(packStatus)
        ? '❌ 한국어 받아쓰기 자료가 이 컴퓨터에 아직 없습니다. 아래 「한국어 자료 내려받기」를 눌러 주세요.'
        : '❌ 소리는 들어가는데 글자가 안 옵니다. 아래 「한국어 자료」 상태를 함께 알려 주세요.'
    return '❌ 소리가 안 잡힙니다. 마이크 볼륨이나 입력 장치를 확인해 주세요.'
  }

  const report = [
    `브라우저: ${navigator.userAgent}`,
    `시험한 장치: ${which}`,
    `언어: ${lang}`,
    `안전한 연결: ${window.isSecureContext ? '예' : '아니오'}`,
    micInfo ? `마이크: ${micInfo.name} · 최대 소리 ${micInfo.peak}%` : '마이크: 재는 중',
    `한국어 자료: ${packStatus ?? '확인 안 함'}`,
    '',
    ...events.map((e) => `${(e.at / 1000).toFixed(1)}s  ${e.what}`),
  ].join('\n')

  return (
    <Card>
      {/*
        평소에는 접어 둔다. 진단 도구는 **안 될 때만** 필요한 물건인데,
        상시 펼쳐 두었더니 화면에서 「이 회의」·「내 메모」만큼 자리를 차지했다.
      */}
      <details>
        <summary className="text-caption text-ink-mute cursor-pointer">
          받아쓰기가 동작하지 않을 때 — <strong className="font-semibold">점검하기</strong>
        </summary>
        <div className="mt-3">
      <p className="text-caption text-ink-mute leading-relaxed">
        10초 동안 받아쓰기 기능이 <strong className="font-semibold">어느 단계까지 진행되는지</strong>{' '}
        기록합니다. 시작한 뒤 <strong className="font-semibold">계속 말씀해 주세요.</strong>
      </p>

      <div className="flex flex-wrap gap-1.5 mt-2">
        {(['ko-KR', 'en-US'] as const).map((l) => (
          <button
            key={l}
            type="button"
            disabled={running}
            onClick={() => setLang(l)}
            className={[
              'text-caption rounded-full px-3 py-1 border',
              lang === l ? 'text-action border-action font-semibold' : 'text-ink-mute border-hairline',
            ].join(' ')}
          >
            {l === 'ko-KR' ? '한국어' : '영어로 시험'}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        <PillButton type="button" disabled={running || !Ctor} onClick={run}>
          {running ? '점검 중… (10초)' : '10초 점검 시작'}
        </PillButton>
        {events.length > 0 && !running && (
          <PillButton
            type="button"
            variant="ghost"
            onClick={() => {
              void navigator.clipboard?.writeText(report)
              setCopied(true)
            }}
          >
            {copied ? '복사했습니다' : '결과 복사'}
          </PillButton>
        )}
      </div>

      {!Ctor && (
        <p className="text-caption text-alert mt-3">
          이 브라우저에는 받아쓰기 기능 자체가 없습니다.
        </p>
      )}

      {micInfo && (
        <p className="text-caption text-ink-soft mt-3 leading-relaxed">
          마이크: <strong className="font-semibold">{micInfo.name}</strong> · 최대 소리{' '}
          <strong className="font-semibold">{micInfo.peak}%</strong>
          {micInfo.peak < 5 && ' — 너무 작습니다'}
        </p>
      )}

      {packStatus && (
        <p className="text-caption text-ink-soft mt-2 leading-relaxed">
          한국어 자료: <strong className="font-semibold">{packStatus}</strong>
        </p>
      )}

      {packStatus && /downloadable|unavailable/.test(packStatus) && (
        <div className="mt-2">
          <PillButton type="button" disabled={installing} onClick={() => void installPack()}>
            {installing ? '내려받는 중…' : '한국어 자료 내려받기'}
          </PillButton>
          <p className="text-caption text-ink-mute mt-1.5 leading-relaxed">
            한 번만 받으면 됩니다. 받고 나면 받아쓰기가 <strong className="font-semibold">이
            컴퓨터 안에서</strong> 돌아 — 음성이 밖으로 안 나가고 더 빨라집니다.
          </p>
        </div>
      )}

      {verdict() && (
        <p className="text-body mt-3 leading-relaxed">
          <strong className="font-semibold">{verdict()}</strong>
        </p>
      )}

      {events.length > 0 && (
        <pre className="text-caption text-ink-soft bg-parchment rounded-md p-3 mt-3 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
          {report}
        </pre>
      )}
        </div>
      </details>
    </Card>
  )
}
