import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { Card } from '../../components/ui'
import HelpCard from './HelpCard'
import { Field, PillButton, TextArea, TextInput } from '../../components/Field'
import { ymd } from '../../domain/daily'
import { mergeIntoTranscript } from '../../domain/transcript'
import { useCompanyId } from '../companies/useCompany'
import {
  loadGlossary,
  transcribeChunk,
  updateMeeting,
  uploadForTranscribe,
  uploadMeetingAudio,
} from './api'
import { CHUNK_SEC, decodeRisk, decodeToMono, makeChunk, readAudioMeta } from './decodeAudio'
import type { AudioMeta, Decoded } from './decodeAudio'
import { chunkRanges } from '../../domain/audio'
import { clock } from '../../domain/transcript'
import { TranscribeModelPicker } from './TranscribeModelPicker'
import { readTranscribeModel, writeTranscribeModel } from './transcribeModels'

/**
 * 화자 구분을 켰을 때 **자르지 않고 통째로 보낼 수 있는 길이** (2026-09-08).
 *
 * 공급자 제약이다 — 화자 구분을 켜면 30분까지만 받는다. 그냥 받아쓰기는 1시간.
 * 이 안에 들면 **화자 번호가 회의 끝까지 이어진다.** 넘으면 예전처럼 잘라
 * 보내고, 그때는 조각마다 번호가 새로 매겨진다.
 */
const WHOLE_MAX_SEC = 30 * 60

/**
 * 녹음 파일을 올려 회의록으로 만든다.
 *
 * ── 왜 필요한가 ──────────────────────────────────────────
 * 브라우저 받아쓰기는 환경을 심하게 탄다 — 며칠을 붙들었는데도 기기마다 다르게 논다.
 * 반면 **폰에 기본으로 들어 있는 녹음기 앱은 어디서나 확실히 동작한다.**
 *
 * 그래서 길을 하나 더 낸다. 회의는 폰 녹음기로 하고, 그 파일을 여기 올린다.
 * 브라우저가 하는 일은 **파일을 잘라 보내는 것**뿐이라 안 되는 자리가 없다.
 *
 * ── 무엇을 하나 ──────────────────────────────────────────
 *   ① 파일을 풀어 16kHz 한 줄로 줄이고 5분씩 자른다 (decodeAudio.ts)
 *   ② 토막마다 서버로 보내 글을 받는다
 *   ③ 받은 글을 시각 순서대로 이어 회의록으로 저장한다
 *   ④ 실패한 토막은 **버리지 않고** 서버 보관함에 넣는다 — 나중에 다시 받아쓴다
 */
export default function AudioUpload() {
  const companyId = useCompanyId()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [metOn, setMetOn] = useState(ymd(new Date()))
  /** 회생·인사 회의 표시. 막지는 않고 표시만 남긴다 (설계서 §5.8 · OQ-16) */
  const [attendees, setAttendees] = useState('')
  const [place, setPlace] = useState('')
  const [sensitive, setSensitive] = useState(false)
  /**
   * 화자 구분 받아쓰기를 켤까 (2026-09-08).
   *
   * 기본은 **켜짐**이다 — 화자 구분이 없으면 회의록의 조치사항 담당을 알 수 없다.
   * 「제가 하겠습니다」의 「제가」가 누구인지 글만 봐서는 모른다.
   */
  const [diarize, setDiarize] = useState(true)
  /** 통째로 보냈을 때 몇 초째 기다리는 중인가. 아무 말이 없으면 멈춘 줄 안다 */
  const [waited, setWaited] = useState(0)

  /** 회의 중 직접 적은 메모. 전사문과 섞지 않는다 */
  const [myNotes, setMyNotes] = useState('')
  /**
   * 파일을 고르는 **즉시** 나오는 판정 — 형식·길이·요금.
   * 푸는 것과 상관없이 알 수 있는 것들이라 기다릴 이유가 없다.
   */
  const [meta, setMeta] = useState<AudioMeta | null>(null)
  const [checking, setChecking] = useState(false)
  /** 푼 소리. 구간은 보낼 때 하나씩 만든다 — 다 만들어 들고 있으면 메모리로 뻗는다 */
  const [decoded, setDecoded] = useState<Decoded | null>(null)
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState<string | null>(null)
  const [ratio, setRatio] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  /**
   * ── 「얼마나 걸리나 · 지금 살아 있나」 ────────────────────
   * 한 시간 반짜리 녹음은 처리에 몇 분이 걸린다. 그동안 화면이 가만히 있으면
   * **멈춘 건지 도는 건지 알 수가 없다.** 그래서 세 가지를 계속 보여 준다 —
   *   ① 몇 구간째인지  ② 경과 시간(매초 올라감)  ③ 남은 예상 시간
   * 특히 ②가 **매초 올라가는 것 자체가 「살아 있다」는 증거**다.
   */
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [tick, setTick] = useState(0)
  const [doneCount, setDoneCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  /** 마지막으로 받아쓴 글 한 토막. 글이 실제로 들어오는 것을 눈으로 본다 */
  /**
   * 지금까지 받아쓴 글 **전체**.
   *
   * ── 왜 전체를 들고 있나 (2026-09-05) ─────────────────────
   * 그전에는 **마지막 120자만** 스쳐 지나가듯 보여 줬다. 그러니 화면에서는
   * 「뭔가 도는 것 같긴 한데 제대로 읽고 있는 건지」를 알 수가 없었다.
   * 부장님이 *"전사문 확인이 안 되다 보니 판독이 안 되고 있는 줄 알았다"* 고 하셨다.
   *
   * **글이 쌓이는 것을 보여 주는 게 「되고 있다」의 유일한 증거다.**
   * 진행 막대는 「보냈다」는 증거일 뿐 「제대로 읽었다」는 증거가 아니다 —
   * 실시간 회의록에서 이미 같은 이유로 토막 길이를 45초에서 15초로 줄였다(2026-08-19).
   */
  const [transcript, setTranscript] = useState('')
  /** 글 상자를 아래로 따라 내리기 위한 손잡이 */
  const textRef = useRef<HTMLDivElement>(null)
  /**
   * 어느 모델로 받아쓸까 (2026-09-05).
   *
   * 같은 녹음 파일을 두 모델로 돌려 견주는 자리다 — 여기가 그 견주기가
   * 가장 쉬운 화면이다. 소리가 그대로 남아 있어 몇 번이든 다시 돌릴 수 있다.
   */
  const [model, setModel] = useState(readTranscribeModel)
  /*
    화자 구분은 **제미나이만 된다.** 다른 모델을 고르면 칸을 잠그고 이유를 밝힌다 —
    켜 놓고 아무 일도 안 일어나면 「됐는데 왜 안 나오지」가 된다.
  */
  const canDiarize = model.startsWith('gemini')
  /** 사람이 멈추라고 했나. 지금 구간까지만 하고 멈춘다 */
  const stopRef = useRef(false)

  // 도는 동안 매초 다시 그린다 — 숫자가 올라가는 것이 「살아 있다」는 신호다
  useEffect(() => {
    if (startedAt === null) return
    const id = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [startedAt])

  const { data: glossary } = useQuery({
    queryKey: ['glossary', companyId],
    queryFn: () => loadGlossary(companyId as string),
    enabled: !!companyId,
  })

  function reset() {
    setFile(null)
    setTitle('')
    setStep(null)
    setRatio(0)
    setDecoded(null)
    setMeta(null)
    setAttendees('')
    setPlace('')
    setMyNotes('')
    setSensitive(false)
    setTranscript('')
    if (fileRef.current) fileRef.current.value = ''
  }

  /**
   * 글이 늘면 **아래로 따라 내린다.**
   *
   * ⚠️ 사용자가 위를 읽고 있으면 **건드리지 않는다.** 무조건 내리면
   * 앞부분을 확인하려는 순간 화면이 아래로 튄다 — 읽을 수가 없다.
   * 이미 바닥 근처에 있을 때만 따라간다.
   */
  useEffect(() => {
    const el = textRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (nearBottom) el.scrollTop = el.scrollHeight
  }, [transcript])

  /**
   * 1단계 — 음성을 분석해 길이를 확정한다.
   *
   * 파일을 고르는 순간 이미 길이·비용은 알려 줬다(readAudioMeta). 여기서는
   * **실제로 보낼 수 있게 소리를 푸는** 무거운 일을 한다 — 100MB 면 1~2분 걸린다.
   * 그래서 사람이 승낙한 뒤에만 돈다.
   */
  async function analyze() {
    if (!file) return
    setBusy(true)
    setError(null)
    setDone(null)
    setTotalCount(0)
    setDoneCount(0)
    // 분석 중에도 시계를 돌린다. 여기가 제일 멈춘 듯 보이는 자리다
    setStartedAt(Date.now())
    try {
      const d = await decodeToMono(file, (label) => setStep(label))
      setDecoded(d)
      setStep(null)
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : String(e)) +
          ' — 녹음 앱에서 30분 이하로 나눠 올리시거나, 「📝 음성텍스트 가져오기」를 이용하시면 됩니다.',
      )
      setStep(null)
    } finally {
      setBusy(false)
      setStartedAt(null)
    }
  }

  /**
   * 2단계 — 구간을 만들어 보내고 받은 글을 이어 붙인다.
   *
   * ── 왜 여러 개를 한꺼번에 보내나 ─────────────────────────
   * 하나씩 순서대로 보내면 22구간짜리 회의가 **10분 넘게** 걸린다.
   * 구간끼리는 서로 상관이 없고, 돌아온 글은 **시각으로 제자리를 찾으므로**
   * 순서가 뒤바뀌어도 괜찮다. 그래서 세 개씩 동시에 보낸다.
   *
   * ⚠️ 더 늘리지 않는 이유 — 너무 몰아 보내면 「요청이 몰렸다」고 거절당한다.
   */
  async function run() {
    if (!file || !decoded || !companyId) return
    setBusy(true)
    setError(null)
    setDone(null)
    stopRef.current = false
    setStartedAt(Date.now())
    setDoneCount(0)
    setTranscript('')

    try {
      /*
        ★ 화자 구분을 켰고 30분 이하면 **자르지 않고 통째로 보낸다** (2026-09-08).

        ── 왜 ────────────────────────────────────────────────
        잘라 보내면 **조각마다 화자 번호가 새로 매겨진다.** 3조각의 「화자1」과
        4조각의 「화자1」이 같은 사람이라는 보장이 없다. 통째로 보내면 저쪽이
        회의 전체를 한 번에 듣고 매기므로 **번호가 끝까지 이어진다.**

        30분이 한도인 이유는 공급자 제약이다 — 화자 구분을 켜면 30분까지만
        받는다(그냥 받아쓰기는 1시간). 그보다 길면 예전처럼 잘라 보낸다.

        ⚠️ 통째로 보낼 때는 **풀어 놓은 소리(wav)가 아니라 원본 파일**을 보낸다.
           wav 는 30분이면 50MB 가 넘는다. 원본은 압축돼 있어 훨씬 작다.
      */
      const whole = diarize && canDiarize && decoded.durationSec <= WHOLE_MAX_SEC

      const ranges = whole
        ? [{ from: 0, to: decoded.durationSec }]
        : chunkRanges(decoded.durationSec, CHUNK_SEC)
      if (ranges.length === 0) throw new Error('소리가 들어 있지 않은 파일입니다.')
      setTotalCount(ranges.length)

      const { data: auth } = await supabase.auth.getUser()
      const userId = auth.user?.id
      if (!userId) throw new Error('로그인 정보를 읽지 못했습니다.')

      // 회의록을 먼저 만든다 — 중간에 끊겨도 그때까지가 남는다
      const { data: meeting, error: insErr } = await supabase
        .from('meetings')
        .insert({
          company_id: companyId,
          user_id: userId,
          met_on: metOn,
          title: title.trim() || file.name.replace(/\.[^.]+$/, ''),
          transcript_source: '녹음전사',
          duration_sec: Math.round(decoded.durationSec),
          attendees: attendees.trim() || null,
          place: place.trim() || null,
          my_notes: myNotes.trim() || null,
          sensitive,
        })
        .select('id')
        .single()
      if (insErr) throw insErr

      /*
        통째로 보낼 때는 **원본을 보관함에 먼저 올린다.** 30분짜리 원본은
        20~30MB 라 서버 함수에 직접 실어 보내면 「너무 큽니다」로 막힌다.
        올려 두면 함수가 거기서 가져간다.
      */
      let wholePath: string | undefined
      if (whole) {
        setStep('소리를 올리는 중…')
        wholePath = await uploadForTranscribe(meeting.id, file)
      }

      const hint = (glossary ?? []).map((g) => g.term).join(', ').slice(0, 700)
      /** 받아쓴 글을 시각 순서로 담아 둔다. 여러 개가 동시에 끝나므로 여기서 모은다 */
      const got = new Map<number, string>()
      let 실패 = 0
      let next = 0

      const worker = async () => {
        for (;;) {
          const i = next++
          if (i >= ranges.length || stopRef.current) return

          // 구간은 보낼 때 만들고 보내고 나면 버린다 — 다 만들어 두면 메모리가 쌓인다
          const blob = whole ? null : makeChunk(decoded, ranges[i].from, ranges[i].to)
          const atMs = Math.round(ranges[i].from * 1000)

          try {
            // 구간 길이를 같이 보낸다 — 전사 요금은 길이로 매겨진다(사용량 기록용)
            const text = await transcribeChunk(
              blob,
              hint,
              model,
              ranges[i].to - ranges[i].from,
              diarize && canDiarize,
              // 통째로 보내면 몇 분 걸린다. 아무 말이 없으면 멈춘 줄 안다
              whole ? (sec) => setWaited(sec) : undefined,
              // 통째로 보낼 때는 소리를 요청에 안 싣는다 — 20MB 를 넘어 막힌다
              whole ? wholePath : undefined,
            )
            if (text.trim()) {
              got.set(atMs, text)
              // 구간을 받을 때마다 저장한다 — 중간에 끊겨도 그때까지가 남는다
              let merged = ''
              for (const at of [...got.keys()].sort((a, b) => a - b)) {
                merged = mergeIntoTranscript(merged, at, got.get(at) as string)
              }
              // 화면에도 같은 글을 넘긴다. **저장한 것과 보여 주는 것이 같아야 한다** —
              // 다르면 「화면엔 있는데 회의록엔 없다」가 생기고 원인을 못 찾는다
              setTranscript(merged)
              await updateMeeting(meeting.id, { transcript: merged })
            }
          } catch (e) {
            실패 += 1
            setError(e instanceof Error ? e.message : String(e))
            /*
              변환하지 못한 구간은 보관함에 넣는다. 회의록에서 나중에 다시 변환할 수 있다.
              통째로 보낸 경우는 **이미 보관함에 있으므로** 또 넣지 않는다.
            */
            if (blob) {
              await uploadMeetingAudio({
                companyId,
                meetingId: meeting.id,
                atMs,
                reason: '받아쓰기 실패',
                blob,
              }).catch(() => {})
            }
          } finally {
            setDoneCount((n) => n + 1)
          }
        }
      }

      /*
        ⚠️ **제미나이는 한 줄로 보낸다** (2026-09-05).

        여기서 보내는 조각은 5분짜리다. 제미나이는 **분당 들어오는 양**에
        한도가 있어서(1만 토큰), 5분짜리를 셋씩 동시에 던지면 **첫 묶음부터
        거절당한다.** 실제로 429 를 받았다.

        OpenAI 쪽은 그 한도가 훨씬 넉넉해서 셋을 그대로 둔다 — 셋이면
        1시간 회의가 3분의 1 시간에 끝난다. **줄일 이유가 없는 쪽까지
        느리게 만들지 않는다.**

        제미나이가 느린 대신 정확하다. 어느 쪽을 고를지는 사용자가 이미
        모델을 고르면서 정한 것이라, 여기서 다시 묻지 않는다.
      */
      const lanes = model.startsWith('gemini') ? 1 : 3
      await Promise.all(Array.from({ length: Math.min(lanes, ranges.length) }, worker))

      setStep(null)
      setDone(
        stopRef.current
          ? `중지했습니다. ${got.size}개 구간까지 변환된 내용은 회의록에 저장되어 있습니다.`
          : 실패 === 0
            ? '회의록을 생성했습니다. 「📋 지난 회의록」에서 열어 수정하고 초안을 작성하세요.'
            : `${ranges.length}구간 중 ${실패}개를 변환하지 못했습니다. 해당 음성은 회의록에 보관되어 있으므로 이후 다시 변환할 수 있습니다.`,
      )
      reset()
      void qc.invalidateQueries({ queryKey: ['meetings'] })
      void qc.invalidateQueries({ queryKey: ['meeting-audio-all'] })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStep(null)
    } finally {
      setBusy(false)
      setStartedAt(null)
    }
  }

  const mb = file ? Math.round((file.size / 1024 / 1024) * 10) / 10 : 0

  // tick 이 매초 바뀌면서 아래 값들이 다시 계산된다 (화면이 살아 있다는 신호)
  void tick
  const elapsedMs = startedAt ? Date.now() - startedAt : 0
  const avgMs = doneCount > 0 ? elapsedMs / doneCount : 0
  const avgSec = doneCount > 0 ? Math.round(avgMs / 1000) : 0
  /** 남은 예상 시간. 세 개씩 동시에 도니 남은 구간 수를 3으로 나눈다 */
  const remainMs =
    doneCount > 0 && totalCount > 0
      ? Math.round(((totalCount - doneCount) * avgMs) / Math.min(3, totalCount))
      : null

  /*
    ── 세 탭이 같은 순서를 갖는다 ────────────────────────────
      ① 무엇을 하는 자리인가 + 실행 버튼
      ② 도움말 (접혀 있음)
      ③ 내용 / 진행 상황
  */
  return (
    /*
      좁은 화면에서는 **「이 회의」 칸이 위로 온다.** 회의명을 먼저 적고 내용을 넣는
      순서라, 폰에서 본문이 위에 있으면 회의명 칸을 찾으러 한참 내려야 한다.
      실시간 탭과 같은 방식이다.
    */
    <div className="flex flex-col-reverse gap-5 lg:grid lg:grid-cols-[1fr_320px] lg:items-start">
      <div className="space-y-5">
        {/* ── ① 파일을 고르고 시작하는 자리 ─────────── */}
        <Card title="🎧 녹음 파일 올리기">
          <p className="text-caption text-ink-mute leading-relaxed">
            녹음 파일을 올리면{' '}
            <strong className="font-semibold">서버에서 문자로 변환해 회의록을 생성합니다.</strong>{' '}
            브라우저 받아쓰기가 지원되지 않는 기기에서도 사용할 수 있습니다.
          </p>

          <div className="mt-3 space-y-3">
            <input
              ref={fileRef}
              type="file"
              accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg,.aac"
              disabled={busy}
              onChange={async (e) => {
                const f = e.target.files?.[0] ?? null
                setFile(f)
                setDone(null)
                setError(null)
                setDecoded(null)
                setMeta(null)
                if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ''))
                if (!f) return
                // 고르는 즉시 판정한다. 분석(1~2분)은 승낙받은 뒤에
                setChecking(true)
                setMeta(await readAudioMeta(f))
                setChecking(false)
              }}
              className="block w-full text-caption file:mr-3 file:rounded-full file:border file:border-hairline
                         file:bg-canvas file:text-action file:px-3 file:py-1.5 file:text-caption"
            />

            {file && (
              <p className="text-caption text-ink-mute">
                {file.name} · {mb}MB
              </p>
            )}

            {checking && <p className="text-caption text-ink-mute">파일 확인 중…</p>}

            {meta && !meta.ok && (
              <div className="bg-parchment rounded-md p-3.5">
                <p className="text-body text-alert font-semibold">이 파일은 사용할 수 없습니다</p>
                <p className="text-caption text-ink-soft mt-1 leading-relaxed">{meta.reason}</p>
                <p className="text-caption text-ink-mute mt-1.5 leading-relaxed">
                  휴대폰 녹음 앱의 <strong className="font-semibold">「텍스트로 변환」</strong> 기능을
                  사용한 뒤 <strong className="font-semibold">「📝 음성텍스트 가져오기」</strong>에
                  붙여넣는 방법도 있습니다. 이 경우 변환 비용이 발생하지 않습니다.
                </p>
              </div>
            )}

            {meta && meta.ok && (
              <div className="bg-parchment rounded-md p-3.5">
                <p className="text-body">
                  길이 <strong className="font-semibold">{clock(meta.durationSec * 1000)}</strong> ·{' '}
                  {chunkRanges(meta.durationSec, CHUNK_SEC).length}구간
                </p>
                <p className="text-body mt-0.5">
                  예상 비용{' '}
                  <strong className="font-semibold">
                    약 {Math.max(1, Math.round(((meta.durationSec / 60) * 8.5) / 10) * 10)}원
                  </strong>{' '}
                  · 예상 시간 약{' '}
                  <strong className="font-semibold">
                    {Math.max(
                      1,
                      Math.round((chunkRanges(meta.durationSec, CHUNK_SEC).length * 30) / 3 / 60),
                    )}
                    분
                  </strong>
                </p>

                {decodeRisk(meta.durationSec) !== '안전' && (
                  <p className="text-caption text-alert mt-2 leading-relaxed">
                    ⚠️{' '}
                    {decodeRisk(meta.durationSec) === '위험'
                      ? '1시간 40분이 넘습니다. 음성 분석 단계에서 실패할 가능성이 높습니다.'
                      : '1시간이 넘습니다. 분석에 1~2분 걸리며 실패할 수도 있습니다.'}{' '}
                    <strong className="font-semibold">
                      아래 「녹음 파일이 잘 변환되게 하려면」을 참고해 나눠 올리시는 편이 안정적입니다.
                    </strong>
                  </p>
                )}

                <p className="text-caption text-ink-mute mt-2 leading-relaxed">
                  진행하시면 ① 음성 분석에 1~2분 ② 이후 구간별로 비용이 발생합니다.
                </p>
              </div>
            )}

            {decoded && !busy && (
              <div className="bg-parchment rounded-md p-3.5">
                <p className="text-body">
                  ✅ 음성 분석을 마쳤습니다.{' '}
                  <strong className="font-semibold">변환을 시작하면 비용이 발생합니다.</strong>
                </p>
              </div>
            )}

            {/* ── 어느 모델로 받아쓸까 ────────────────────
                변환을 시작하기 전에만 바꿀 수 있다. 도중에 바꾸면 앞 구간과
                뒤 구간이 다른 모델로 적혀 한 회의록 안에서 문체가 갈린다 */}
            {file && (
              <TranscribeModelPicker
                value={model}
                disabled={busy}
                onChange={(id) => {
                  setModel(id)
                  writeTranscribeModel(id)
                }}
              />
            )}

            <div className="flex flex-wrap items-center gap-2">
              {!decoded ? (
                <PillButton
                  type="button"
                  disabled={!file || busy || checking || !meta?.ok}
                  onClick={() => void analyze()}
                >
                  {busy ? '음성 분석 중…' : '진행하기'}
                </PillButton>
              ) : (
                <PillButton
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    // 잠그지 않고, 왜 안 되는지 말해 주고 그 칸으로 데려간다
                    if (!title.trim()) {
                      setError('회의명을 입력해 주세요. 오른쪽 「이 회의」 칸에 있습니다.')
                      titleRef.current?.focus()
                      return
                    }
                    setError(null)
                    void run()
                  }}
                >
                  {busy ? '변환 중…' : '변환 시작'}
                </PillButton>
              )}
              {file && !busy && (
                <PillButton type="button" variant="ghost" onClick={reset}>
                  취소
                </PillButton>
              )}

            </div>

            {done && <p className="text-caption text-ink-soft leading-relaxed">{done}</p>}
            {error && <p className="text-caption text-alert leading-relaxed">{error}</p>}
          </div>
        </Card>

        {/* ── ② 도움말 ──────────────────────────────── */}
        <HelpCard title="녹음 파일이 잘 변환되게 하려면">
          <p>
            <strong className="font-semibold">① 30분~1시간 단위로 나눠 녹음하세요.</strong>
            <br />1시간을 넘으면 브라우저가 음성을 분석하는 단계에서 실패할 수 있고, 1시간 40분이
            넘으면 대부분 실패합니다. 회의 중 쉬는 시간에 끊어 두시면 됩니다.
          </p>
          <p>
            <strong className="font-semibold">② 잡담·대기 시간은 빼고 올리세요.</strong>
            <br />
            비용은 음성 길이에 비례합니다. 회의 전 잡담과 쉬는 시간을 빼면 그만큼 줄어듭니다.
          </p>
          <p>
            <strong className="font-semibold">③ 녹음기를 회의 테이블 가운데 두세요.</strong>
            <br />
            정확도를 좌우하는 것은 대부분 마이크 위치입니다. 휴대폰을 엎어 두지 말고 화면이 위를
            향하게 놓아 주세요.
          </p>
          <p>
            <strong className="font-semibold">④ 사내 용어를 등록해 두세요.</strong>
            <br />
            「기준 › 설정 › 사내 용어집」에 등록한 용어는 변환할 때 함께 전달되어, 「타이백」처럼
            잘못 들리는 일이 줄어듭니다.
          </p>
          <p className="text-ink-mute">
            지원 형식 — m4a · mp3 · wav · webm · ogg. 휴대폰 기본 녹음 앱은 대부분 m4a 입니다.
          </p>
        </HelpCard>

        {/* ── ③ 진행 상황 ───────────────────────────── */}
        <Card title="변환 진행">
          {!busy ? (
            /* 끝난 뒤에는 안내를 안 띄운다 — 아래에 받아쓴 글이 있는데
               「누르면 표시됩니다」가 위에 남아 있으면 아직 안 한 것처럼 보인다 */
            transcript ? null : (
              <p className="text-caption text-ink-mute leading-relaxed">
                {decoded
                  ? '「변환 시작」을 누르면 이곳에 진행 상황이 표시됩니다.'
                  : '파일을 고르고 「진행하기」를 누르면 이곳에 진행 상황이 표시됩니다.'}
              </p>
            )
          ) : (
            <div>
              <div className="h-2 w-full bg-parchment rounded-full overflow-hidden">
                <div
                  className="h-full bg-action rounded-full transition-[width]"
                  style={{
                    width: `${
                      totalCount > 0
                        ? Math.round((doneCount / totalCount) * 100)
                        : Math.round(ratio * 100)
                    }%`,
                  }}
                />
              </div>

              {/* 경과 시간이 매초 올라가는 것 자체가 「진행 중」이라는 증거다 */}
              <div className="mt-2 text-caption text-ink-soft leading-relaxed">
                {/*
                  통째로 보낸 경우는 「구간」이 하나뿐이라 진행률이 0%에서 100%로
                  건너뛴다. 그동안 아무 말이 없으면 멈춘 줄 아니까 **기다린 시간**을
                  대신 보여 준다 — 올라가는 숫자 자체가 「돌고 있다」는 증거다.
                */}
                {waited > 0 ? (
                  <>
                    <p>
                      <strong className="font-semibold">회의 전체를 한 번에 받아쓰는 중</strong>{' '}
                      · 경과 {clock(elapsedMs)}
                    </p>
                    <p className="text-ink-mute">
                      화자 구분을 켜면 회의를 통째로 보냅니다. 30분 분량이면 몇 분 걸립니다.
                      {waited > 240 && ' 조금만 더 기다려 주세요.'}
                    </p>
                  </>
                ) : totalCount > 0 ? (
                  <>
                    <p>
                      <strong className="font-semibold">
                        {doneCount} / {totalCount} 구간
                      </strong>{' '}
                      · 경과 {clock(elapsedMs)}
                      {remainMs !== null && ` · 남은 시간 약 ${clock(remainMs)}`}
                    </p>
                    <p className="text-ink-mute">구간당(5분 분량) 평균 {avgSec}초 소요 중</p>
                  </>
                ) : (
                  <p>
                    {step ?? '처리 중…'} · 경과 {clock(elapsedMs)}
                  </p>
                )}
              </div>

              <PillButton
                type="button"
                variant="ghost"
                className="mt-2"
                onClick={() => {
                  stopRef.current = true
                  setStep('현재 구간까지 처리한 뒤 중지합니다…')
                }}
              >
                중지
              </PillButton>
            </div>
          )}

          {/* ── 지금까지 받아쓴 글 ─────────────────────
              ★ **여기가 「되고 있다」의 유일한 증거다.**
              진행 막대는 「보냈다」는 증거일 뿐 「제대로 읽었다」는 증거가 아니다.
              변환이 끝난 뒤에도 남겨 둔다 — 회의록으로 넘어가지 않고 여기서
              바로 확인하실 수 있어야 한다 */}
          {transcript && (
            <div className="mt-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-caption text-ink-soft font-semibold">받아쓴 글</p>
                <p className="text-caption text-ink-mute tabular-nums">
                  {transcript.length.toLocaleString()}자
                </p>
              </div>
              <div
                ref={textRef}
                className="mt-1.5 max-h-[320px] overflow-y-auto bg-parchment rounded-md px-3.5 py-3"
              >
                <p className="text-caption text-ink-soft leading-relaxed whitespace-pre-wrap break-words">
                  {transcript}
                </p>
              </div>
              <p className="text-caption text-ink-mute mt-1.5 leading-relaxed">
                {busy
                  ? '구간을 받을 때마다 이어 붙습니다. 사람 이름·사내 용어가 틀렸으면 변환이 끝난 뒤 회의록에서 고치시면 됩니다.'
                  : '이 글은 회의록에 저장돼 있습니다. 「기록 › 회의록」에서 고치실 수 있습니다.'}
              </p>
            </div>
          )}

          <p className="text-caption text-ink-mute mt-3 leading-relaxed">
            긴 파일은 <strong className="font-semibold">5분 단위로 분할</strong>해 전송하며, 구간을
            받을 때마다 저장합니다. 중간에 중지하거나 창을 닫아도 그때까지 변환된 내용은 회의록에
            남습니다. 원본 파일은 서버에 보관하지 않고,{' '}
            <strong className="font-semibold">변환하지 못한 구간만</strong> 보관해 재시도합니다.
          </p>
        </Card>
      </div>

      {/* ── 오른쪽: 회의 정보 · 내 메모 ───────────────── */}
      <div className="space-y-5">
        <Card title="이 회의">
          <div className="space-y-3">
            <Field label="회의명">
              <TextInput
                ref={titleRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 자재 단가 협의"
              />
            </Field>
            <Field label="일자">
              <TextInput type="date" value={metOn} onChange={(e) => setMetOn(e.target.value)} />
            </Field>
            <Field label="참석자" hint="역할로 적습니다">
              <TextInput
                value={attendees}
                onChange={(e) => setAttendees(e.target.value)}
                placeholder="예: 대표, 구매사업본부 담당자"
              />
            </Field>
            <Field label="장소/방식">
              <TextInput
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                placeholder="예: 본사 회의실 / Zoom"
              />
            </Field>

            <label className="flex items-start gap-2 text-body pt-1">
              <input
                type="checkbox"
                checked={diarize && canDiarize}
                disabled={!canDiarize}
                onChange={(e) => setDiarize(e.target.checked)}
                className="accent-action mt-1.5 shrink-0"
              />
              <span className={canDiarize ? '' : 'text-ink-mute'}>
                화자 구분 받아쓰기
                <span className="block text-caption text-ink-mute leading-relaxed mt-0.5">
                  {!canDiarize ? (
                    <>이 기능은 제미나이에서만 됩니다. 위에서 받아쓰기 모델을 바꿔 주세요.</>
                  ) : !meta || !meta.ok || meta.durationSec <= WHOLE_MAX_SEC ? (
                    <>
                      「화자1: …」처럼 말한 사람별로 줄이 나뉩니다.{' '}
                      <strong className="font-semibold">
                        30분 이하는 자르지 않고 통째로 보내므로 화자 번호가 끝까지
                        이어집니다.
                      </strong>{' '}
                      대신 한 번에 몇 분이 걸립니다.
                    </>
                  ) : (
                    <>
                      「화자1: …」처럼 말한 사람별로 줄이 나뉩니다.{' '}
                      <strong className="font-semibold text-alert">
                        이 녹음은 30분이 넘어 5분씩 잘라 보냅니다 — 번호가 구간마다
                        새로 매겨집니다.
                      </strong>{' '}
                      3구간의 화자1과 4구간의 화자1이 같은 사람이라는 보장이 없습니다.
                      회의록을 만들 때 참석자 목록과 대조해 AI 가 추정하고, 확신이
                      없으면 「확인 필요」에 적습니다.{' '}
                      <strong className="font-semibold">
                        30분 이하로 나눠 녹음하시면 이 문제가 없습니다.
                      </strong>
                    </>
                  )}
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2 text-body pt-1">
              <input
                type="checkbox"
                checked={sensitive}
                onChange={(e) => setSensitive(e.target.checked)}
                className="accent-action mt-1.5 shrink-0"
              />
              <span>
                민감 회의 (회생 · 인사)
                <span className="block text-caption text-ink-mute leading-relaxed mt-0.5">
                  표시만 해 둡니다. 저장은 동일하게 진행되며, 이후 보안 정책을 정할 때 이 표시로
                  선별하기 위한 것입니다.
                </span>
              </span>
            </label>
          </div>
        </Card>

        <Card title="내 메모">
          <p className="text-caption text-ink-mute mb-2 leading-relaxed">
            음성에 없는 내용 — 판단, 확인할 사항. 전사문과 구분해 따로 저장됩니다.
          </p>
          <TextArea rows={8} value={myNotes} onChange={(e) => setMyNotes(e.target.value)} />
        </Card>
      </div>
    </div>
  )
}
