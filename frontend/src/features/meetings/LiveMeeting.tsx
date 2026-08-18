import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, EmptyState } from '../../components/ui'
import { Field, PillButton, TextArea, TextInput } from '../../components/Field'
import { ymd } from '../../domain/daily'
import {
  clock,
  editSegment,
  hhmm,
  parseMinutes,
  toggleMark,
  transcriptStats,
  transcriptText,
  usedGlossary,
} from '../../domain/transcript'
import type { Minutes, Segment } from '../../domain/transcript'
import { parseMinutesDoc } from '../../domain/minutes'
import { dropHallucination } from '../../domain/hallucination'
import { useCompanyId } from '../companies/useCompany'
import { useRegisteredAreas } from '../areas/useAreaOptions'
import { useLiveTranscript } from './useLiveTranscript'
import SpeechCheck from './SpeechCheck'
import { useRecorder } from './useRecorder'
import {
  callMinutes,
  loadGlossary,
  saveLiveMeeting,
  transcribeChunk,
  uploadMeetingAudio,
} from './api'
import { appendFinal } from '../../domain/transcript'

/**
 * 실시간 회의록 — 회의 중에 듣고, 끝나면 초안이 나와 있다.
 *
 * ── 무엇이 어디서 일어나나 ───────────────────────────────
 *   마이크 열고 닫기      useLiveTranscript.ts
 *   들린 말을 줄로 정리   domain/transcript.ts   (테스트가 있는 곳)
 *   회의록 초안 만들기    Edge Function ai-assist (mode: 회의록)
 *   여기                 그것들을 잇고, 사람이 고칠 자리를 만든다
 *
 * ⚠️ **음성이 브라우저 제조사 서버로 나간다.** 그래서
 *    ① 자동으로 켜지지 않는다 ② 무엇이 나가는지 화면에 항상 적는다
 *
 *    민감 회의(회생·인사)도 **막지 않는다** — 사용자 판단 (2026-08-16).
 *    「민감」은 표시로만 남긴다. 되돌릴 때 그 표시로 골라낸다 (설계서 §5.8 · OQ-16)
 */

const DRAFT_KEY = 'work-management:live-meeting'

/**
 * 받아쓰기를 어디서 하나 — 두 갈래.
 *
 * ⚡ 브라우저   : 브라우저에 내장된 받아쓰기. 공짜, 말하는 즉시 글자.
 *                **폰에서는 잘 안 된다** — 삼성 인터넷엔 없고, 안드로이드 크롬은 자꾸 끊긴다
 * 🎧 녹음      : 브라우저는 녹음만 하고 **서버가 받아쓴다**.
 *                15초마다 글이 올라오고, 기기를 안 가리며, 사내 용어를 미리 알려 줄 수 있다.
 *                대신 소리 길이만큼 요금이 붙는다
 */
const WAYS = ['⚡ 브라우저', '🎧 녹음'] as const
type Way = (typeof WAYS)[number]

/**
 * 어느 브라우저인가.
 *
 * ── 왜 이걸 보나 ─────────────────────────────────────────
 * 받아쓰기 기능이 **있는 척만 하는 브라우저**가 있다. 크롬을 바탕으로 만든
 * 브라우저(웨일·삼성 인터넷 등)는 `webkitSpeechRecognition` 이라는 이름은
 * 그대로 물려받았지만 **뒤에서 실제로 받아써 주는 서비스가 없다.**
 *
 * 그래서 화면에서는 「지원함」으로 보이고, 마이크도 열리고, 소리 감지 신호까지
 * 오는데 **글자만 영영 안 나온다.** 실제로 그 일이 났다 (2026-08-16).
 * 이름을 보여 줘야 사용자가 「내 잘못인가」를 그만 의심한다.
 */
function browserName(): { name: string; speechOk: boolean } {
  if (typeof navigator === 'undefined') return { name: '알 수 없음', speechOk: false }
  const ua = navigator.userAgent
  if (/Whale/i.test(ua)) return { name: '네이버 웨일', speechOk: false }
  if (/SamsungBrowser/i.test(ua)) return { name: '삼성 인터넷', speechOk: false }
  if (/OPR|Opera/i.test(ua)) return { name: '오페라', speechOk: false }
  if (/Firefox/i.test(ua)) return { name: '파이어폭스', speechOk: false }
  if (/Edg\//i.test(ua)) return { name: '엣지', speechOk: true }
  if (/Chrome/i.test(ua)) return { name: '크롬', speechOk: true }
  if (/Safari/i.test(ua)) return { name: '사파리', speechOk: true }
  return { name: '알 수 없는 브라우저', speechOk: false }
}

/** 손가락으로 쓰는 기기인가. 폰·태블릿이면 처음부터 녹음 쪽을 고른다 */
function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true
}

type Meta = { met_on: string; title: string; place: string; attendees: string }
type Saved = {
  meta: Meta
  segments: Segment[]
  elapsedMs: number
  myNotes: string
  /** 회의가 실제로 시작된 벽시계 시각 「HH:MM」. 탭이 닫혔다 열려도 잃지 않게 같이 적어 둔다 */
  startedAt?: string
}
type Draft = { text: string; minutes: Minutes; model: string; truncated?: boolean }

export default function LiveMeeting() {
  const companyId = useCompanyId()
  const qc = useQueryClient()
  const live = useLiveTranscript()
  /** 회의록 분류에 쓸 업무영역. 지난 회의록 화면과 같은 목록을 본다 */
  const areas = useRegisteredAreas()

  const [meta, setMeta] = useState<Meta>({
    met_on: ymd(new Date()),
    title: '',
    place: '',
    attendees: '',
  })
  const [myNotes, setMyNotes] = useState('')
  const [sensitive, setSensitive] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [fix, setFix] = useState({ agenda: '', decisions: '' })
  const [todos, setTodos] = useState<{ text: string; area: string; take: boolean }[]>([])
  const [recovered, setRecovered] = useState<Saved | null>(null)

  /**
   * 회의가 실제로 시작된 벽시계 시각.
   *
   * **손으로 안 적게 하려고 둔다.** 이미 시간을 재고 있는데 「몇 시에 시작했나」를
   * 또 적으라고 하면 안 적는다. 처음 소리가 흐른 순간에 한 번만 찍고 안 바꾼다 —
   * 중간에 멈췄다 다시 켜도 회의 시작은 처음 그 시각이다.
   */
  const startedAtRef = useRef<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const browser = useMemo(browserName, [])
  const speechOk = live.supported && live.secure
  /**
   * 어느 길로 받아쓸까.
   *
   * **폰·태블릿이면 처음부터 「녹음」 쪽을 고른다.** 브라우저 내장 받아쓰기가
   * 폰에서 글자를 한 자도 못 내놓은 일이 있었기 때문이다. 노트북에서는
   * 공짜에 즉시 나오는 브라우저 쪽이 낫다.
   */
  const [way, setWay] = useState<Way>(() =>
    !speechOk || isTouchDevice() ? '🎧 녹음' : '⚡ 브라우저',
  )
  /** 서버가 지금 받아쓰고 있는 토막 수. 0보다 크면 화면에 「받아쓰는 중」이 뜬다 */
  const [pending, setPending] = useState(0)
  const [recNote, setRecNote] = useState<string | null>(null)
  /**
   * ── 안전망 ───────────────────────────────────────────────
   * 받아쓰기가 글자를 못 내놓으면 **그동안 한 말이 통째로 사라진다.**
   * 소리는 저장되지 않고 흘러가기 때문이다. 그래서 회의 중에 **소리도 함께 담아 둔다.**
   *
   * 이 소리는 **이 브라우저 안에만** 있다. 서버로 보내지 않으므로 요금도 0원이고
   * 밖으로도 안 나간다. 회의가 끝나면 내려받을 수 있고, 안 내려받으면 그냥 버려진다.
   */
  const [keepAudio, setKeepAudio] = useState(true)
  const [audio, setAudio] = useState<Blob | null>(null)
  /**
   * 저장할 때 소리도 서버에 함께 올릴까.
   *
   * null 이면 툴이 알아서 정한다 — **글자가 하나도 안 나온 회의는 올리고,
   * 잘 받아쓴 회의는 안 올린다.** 잘 받아썼으면 소리는 더 볼 일이 없고,
   * 안 받아썼으면 소리가 그 회의의 유일한 기록이기 때문이다.
   */
  const [uploadAudio, setUploadAudio] = useState<boolean | null>(null)
  /** 서버가 변환하지 못한 구간들. 크레딧이 없어 실패한 경우 나중에 다시 보낼 수 있다 */
  const [failed, setFailed] = useState<{ blob: Blob; at: number }[]>([])

  const { data: glossary } = useQuery({
    queryKey: ['glossary', companyId],
    queryFn: () => loadGlossary(companyId as string),
    enabled: !!companyId,
  })

  const listRef = useRef<HTMLDivElement>(null)
  /** 회의명을 안 적었을 때 그 칸으로 데려가기 위한 손잡이 */
  const titleRef = useRef<HTMLInputElement>(null)
  const stats = transcriptStats(live.segments)
  const text = useMemo(() => transcriptText(live.segments), [live.segments])

  /**
   * 받아쓰기 전에 미리 알려 줄 사내 용어.
   *
   * 브라우저 내장 받아쓰기로는 못 하던 일이다 — 서버로 보내는 쪽만 가능하다.
   * 「타이백」이 아니라 「타이벡」으로 적히게 하는 자리 (설계서 §5.8).
   */
  const termHint = useMemo(
    () => (glossary ?? []).map((g) => g.term).join(', ').slice(0, 700),
    [glossary],
  )

  const setSegments = live.setSegments
  /** 녹음 토막 하나가 끝날 때마다 서버로 보내고, 돌아온 글을 줄로 붙인다 */
  const handleChunk = useCallback(
    async (blob: Blob, atMs: number) => {
      setPending((n) => n + 1)
      setRecNote(null)
      try {
        const raw = await transcribeChunk(blob, termHint)
        /*
          받아쓰기가 **지어낸 말**을 여기서 턴다.

          말이 없는 토막은 녹음기가 이미 안 보낸다. 그래도 「작게 웅성거리는」
          토막은 통과하는데, 그런 걸 받으면 모델이 유튜브 자막에서 흔한 말을
          지어낸다 — 「시청해주셔서 감사합니다」가 회의록에 들어왔다(2026-08-19).

          ⚠️ **토막 하나 단위로** 부르는 것이 중요하다. 회의 전체 글에 걸면
          가운데 있는 진짜 「감사합니다」까지 지워진다.
        */
        const got = dropHallucination(raw)
        if (got) setSegments((prev) => appendFinal(prev, got, atMs))
      } catch (e) {
        // 토막 하나가 실패해도 회의는 계속돼야 한다. 알리기만 하고 넘어간다.
        // ⚠️ 소리는 **버리지 않고 들고 있는다** — 크레딧이 없어 실패한 것이라면
        //    채운 뒤 다시 보내면 그 토막이 되살아난다
        setFailed((prev) => [...prev, { blob, at: atMs }])
        setRecNote(e instanceof Error ? e.message : String(e))
      } finally {
        setPending((n) => n - 1)
      }
    },
    [termHint, setSegments],
  )
  const recorder = useRecorder(handleChunk)
  /**
   * 안전망 녹음기 — 끊지 않고 한 파일로 담는다 (토막 길이 0).
   * ⚡ 브라우저 받아쓰기를 쓸 때 같이 돈다. 서버로 보내지 않는다.
   */
  const safety = useRecorder(
    useCallback((blob: Blob) => setAudio(blob), []),
    0,
  )
  const recordOk = recorder.supported && live.secure

  useEffect(() => {
    if (!startedAtRef.current && live.elapsedMs > 0) startedAtRef.current = hhmm(new Date())
  }, [live.elapsedMs])

  // ── 브라우저에 임시 저장 ────────────────────────────────
  // 회의 중에 탭이 닫히면 한 시간이 통째로 날아간다. 그래서 계속 적어 둔다.
  // (이 글은 이 컴퓨터의 브라우저에만 있다. 저장을 눌러야 서버로 간다)
  useEffect(() => {
    if (live.segments.length === 0) return
    const payload: Saved = {
      meta,
      segments: live.segments,
      elapsedMs: live.elapsedMs,
      myNotes,
      startedAt: startedAtRef.current ?? undefined,
    }
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload))
    } catch {
      // 저장 공간이 꽉 찼거나 막혀 있으면 그냥 넘어간다. 회의는 계속돼야 한다
    }
  }, [live.segments, live.elapsedMs, meta, myNotes])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as Saved
      if (Array.isArray(saved?.segments) && saved.segments.length > 0) setRecovered(saved)
    } catch {
      localStorage.removeItem(DRAFT_KEY)
    }
  }, [])

  // 새 말이 올라오면 아래로 따라간다. 회의 중에 스크롤을 손으로 내리고 있을 수 없다
  useEffect(() => {
    if (live.status !== '듣는중') return
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [live.segments, live.interim, live.status])

  const ask = useMutation({
    mutationFn: async () => {
      const used = usedGlossary(text, glossary ?? [])
      return await callMinutes({
        transcript: text,
        title: meta.title,
        attendees: meta.attendees,
        myNotes,
        glossary: used,
        // ⚠️ 이걸 안 넘기고 있었다(2026-08-18 발견). 지난 회의록 화면만 넘기고
        //    실시간은 빠져 있어서, AI 가 우리 목록 밖의 분류를 지어냈다
        areas,
      })
    },
    onSuccess: (reply) => {
      const minutes = parseMinutes(reply.text)
      setDraft({ text: reply.text, minutes, model: reply.model, truncated: reply.truncated })
      setFix({
        agenda: minutes.summary.join('\n'),
        decisions: minutes.decisions.join('\n'),
      })
      /*
        할 일은 칸으로 나눠 받는다 — AI 가 「행동 | 담당자 | 기한 | 분류」로 준다.
        예전에는 그 줄을 통째로 인박스에 넣어서, 인박스에
        「견적 받기 | 담당자 | 수요일 | 품목·가격」이 그대로 들어갔다.

        형식이 어긋나 못 나눴으면 **예전 방식으로 되돌아간다** —
        형식이 틀렸다고 사람이 말한 것을 잃으면 안 된다.
      */
      const acts = parseMinutesDoc(reply.text, areas).actions
      setTodos(
        acts.length > 0
          ? acts.map((a) => ({ text: a.text, area: a.area, take: true }))
          : minutes.followUps.map((t) => ({ text: t, area: '', take: true })),
      )
    },
  })

  const save = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error('업체 정보를 읽지 못했습니다.')

      return await saveLiveMeeting({
        companyId,
        met_on: meta.met_on,
        title: meta.title.trim(),
        place: meta.place,
        attendees: meta.attendees,
        agenda: fix.agenda,
        decisions: fix.decisions,
        transcript: text,
        myNotes,
        durationSec: Math.round(live.elapsedMs / 1000),
        // 받아쓰기를 한 번도 안 켰으면(직접입력) 시각도 없다. 나중에 손으로 채운다
        startedAt: startedAtRef.current,
        endedAt: startedAtRef.current ? hhmm(new Date()) : null,
        aiDraft: draft ? { text: draft.text, minutes: draft.minutes, model: draft.model } : null,
        followUps: todos.filter((t) => t.take).map((t) => ({ text: t.text, area: t.area })),
        sensitive,
        // 받아쓴 글이 없으면 「직접입력」이다 — 나중에 전사문을 붙여넣을 회의록이다
        source:
          live.segments.length === 0
            ? '직접입력'
            : way === '🎧 녹음'
              ? '녹음전사'
              : '실시간받아쓰기',
      })
    },
    onSuccess: async (meetingId) => {
      /*
        받아쓰지 못한 소리를 **서버 보관함에 올린다.**

        브라우저 안에만 두면 폰에서 녹음한 것을 노트북에서 못 본다 —
        회의는 폰으로 하고 정리는 앉아서 하는데 그 흐름이 막힌다.
        올려 두면 그 회의록을 여는 어느 기기에서나 「다시 받아쓰기」를 누를 수 있다.

        올리다 실패해도 **회의록 저장은 이미 끝났다.** 소리만 못 옮긴 것이므로
        알리기만 하고 넘어간다 — 여기서 던지면 저장까지 실패한 것처럼 보인다.
      */
      const 소리들 = [
        ...(audio && willUploadAudio ? [{ atMs: 0, reason: '안전망' as const, blob: audio }] : []),
        ...failed.map((f) => ({ atMs: f.at, reason: '받아쓰기 실패' as const, blob: f.blob })),
      ]
      let 올린수 = 0
      for (const one of 소리들) {
        if (!companyId) break
        try {
          await uploadMeetingAudio({ companyId, meetingId, ...one })
          올린수 += 1
        } catch (e) {
          setRecNote(
            `소리를 서버에 올리지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`,
          )
        }
      }
      void qc.invalidateQueries({ queryKey: ['meeting-audio', meetingId] })

      const 담긴수 = todos.filter((t) => t.take).length
      setDone(
        [
          '회의록을 저장했습니다.',
          담긴수 > 0 ? `할 일 ${담긴수}건을 인박스로 보냈습니다.` : '',
          올린수 > 0
            ? `음성 ${올린수}건을 서버에 함께 보관했습니다. 「📋 지난 회의록」에서 해당 회의를 열면 어느 기기에서나 다시 변환할 수 있습니다.`
            : '',
        ]
          .filter(Boolean)
          .join(' '),
      )
      clearAll()
      void qc.invalidateQueries({ queryKey: ['meetings'] })
      void qc.invalidateQueries({ queryKey: ['inbox'] })
    },
  })

  /** 변환하지 못한 구간을 다시 보낸다. 성공한 것만 목록에서 뺀다 */
  async function retryFailed() {
    setRecNote(null)
    const left: { blob: Blob; at: number }[] = []
    for (const item of failed) {
      setPending((n) => n + 1)
      try {
        const got = await transcribeChunk(item.blob, termHint)
        if (got) setSegments((prev) => appendFinal(prev, got, item.at))
      } catch (e) {
        left.push(item)
        setRecNote(e instanceof Error ? e.message : String(e))
      } finally {
        setPending((n) => n - 1)
      }
    }
    setFailed(left)
    if (left.length === 0) setRecNote(null)
  }

  function clearAll() {
    recorder.stop()
    safety.stop()
    setAudio(null)
    setFailed([])
    live.reset()
    setDraft(null)
    setFix({ agenda: '', decisions: '' })
    setTodos([])
    setMyNotes('')
    setSensitive(false)
    setMeta({ met_on: ymd(new Date()), title: '', place: '', attendees: '' })
    setRecovered(null)
    localStorage.removeItem(DRAFT_KEY)
  }

  // ── 둘 다 못 쓰는 자리에서만 막는다 ─────────────────────
  if (!speechOk && !recordOk) {
    return (
      <Card title="🎙 실시간 회의록">
        <p className="text-body text-ink-soft leading-relaxed">
          {live.secure
            ? '이 브라우저에서는 마이크를 쓸 수 없습니다.'
            : '주소가 안전한 연결(https)이 아니어서 마이크를 열 수 없습니다.'}
        </p>
        <p className="text-caption text-ink-mute mt-2 leading-relaxed">
          크롬에서 열면 됩니다. 그때까지는 옆의 「직접 쓰기」로 회의록을 남길 수 있습니다.
        </p>
      </Card>
    )
  }

  /** 저장할 때 소리를 올릴 것인가 (사람이 안 정했으면 툴이 정한다) */
  const willUploadAudio = uploadAudio ?? live.segments.length === 0

  const listening = live.status === '듣는중'
  const paused = live.status === '멈춤'
  const finished = live.status === '끝'
  const idle = live.status === '준비'
  const recording = way === '🎧 녹음'

  // ── 듣기 시작·멈춤 — 고른 길에 따라 갈린다 ──────────────
  async function begin() {
    setRecNote(null)
    setAudio(null)
    if (recording) {
      live.startTimer()
      const ok = await recorder.start(live.elapsedNow)
      if (!ok) live.pause()
    } else {
      live.start()
      // 받아쓰기가 글자를 못 내놔도 말이 사라지지 않게, 소리를 따로 담아 둔다
      if (keepAudio) await safety.start(live.elapsedNow)
    }
  }
  async function again() {
    if (recording) {
      live.resumeTimer()
      const ok = await recorder.start(live.elapsedNow)
      if (!ok) live.pause()
    } else {
      live.resume()
      if (keepAudio) await safety.start(live.elapsedNow)
    }
  }
  function hold() {
    recorder.stop()
    safety.stop()
    live.pause()
  }
  function finish() {
    recorder.stop()
    safety.stop()
    live.stop()
  }

  return (
    /*
      좁은 화면에서는 **「이 회의」 칸이 위로 온다.**
      제목을 적고 나서 듣기를 시작하는 순서라, 폰에서 받아쓴 말이 위에 있으면
      제목 칸을 찾으러 한참 내려야 한다. flex-col-reverse 로 순서를 뒤집는다.
    */
    <div className="flex flex-col-reverse gap-5 lg:grid lg:grid-cols-[1fr_320px] lg:items-start">
      {/* ── 왼쪽: 말 ──────────────────────────────────── */}
      <div className="space-y-5">
        {done && (
          <div className="bg-parchment border border-hairline rounded-lg px-5 py-4 flex items-center justify-between gap-4">
            <p className="text-body">{done}</p>
            <button
              type="button"
              onClick={() => setDone(null)}
              className="text-caption text-action font-semibold shrink-0"
            >
              닫기
            </button>
          </div>
        )}

        {recovered && idle && (
          <div className="bg-parchment border border-hairline rounded-lg px-5 py-4">
            <p className="text-body">
              저장하지 않은 회의가 남아 있습니다 —{' '}
              <strong className="font-semibold">{recovered.meta.title || '제목 없음'}</strong>{' '}
              <span className="text-ink-mute">
                {recovered.segments.length}줄 · {clock(recovered.elapsedMs)}
              </span>
            </p>
            <div className="flex gap-2 mt-3">
              <PillButton
                type="button"
                onClick={() => {
                  setMeta(recovered.meta)
                  setMyNotes(recovered.myNotes ?? '')
                  // 되살릴 때 시작 시각도 같이 — 안 그러면 이어 쓴 시각이 시작으로 잡힌다
                  startedAtRef.current = recovered.startedAt ?? null
                  live.restore(recovered.segments, recovered.elapsedMs)
                  setRecovered(null)
                }}
              >
                이어서 정리하기
              </PillButton>
              <PillButton
                type="button"
                variant="ghost"
                onClick={() => {
                  localStorage.removeItem(DRAFT_KEY)
                  setRecovered(null)
                }}
              >
                삭제
              </PillButton>
            </div>
          </div>
        )}

        <Card>
          {/* ── 받아쓰기 방식 ─────────────────────────────
              시작 전에만 바꿀 수 있다. 회의 중에 바꾸면 그때까지 받아쓴 것이 헝클어진다 */}
          {idle && (
            <div className="mb-4">
              <div className="flex flex-wrap gap-1.5">
                {WAYS.map((w) => {
                  const usable = w === '🎧 녹음' ? recordOk : speechOk
                  return (
                    <button
                      key={w}
                      type="button"
                      disabled={!usable}
                      onClick={() => setWay(w)}
                      className={[
                        'text-caption rounded-full px-3 py-1.5 border',
                        way === w
                          ? 'text-action border-action font-semibold'
                          : 'text-ink-mute border-hairline',
                        usable ? '' : 'opacity-40',
                      ].join(' ')}
                    >
                      {w}
                    </button>
                  )
                })}
              </div>
              <p className="text-caption text-ink-mute mt-2 leading-relaxed">
                {recording
                  ? '녹음한 음성을 15초 단위로 서버에 전송해 문자로 변환합니다(첫 토막은 6초). 휴대폰·태블릿에서도 동작하며, 사내 용어를 사전에 전달합니다. 음성 길이에 비례해 비용이 발생합니다.'
                  : `브라우저에 내장된 받아쓰기 기능을 사용합니다. 별도 비용이 없으며 발언과 동시에 문자로 표시됩니다. 현재 브라우저는 「${browser.name}」입니다.`}
              </p>

              {/* 받아쓰기가 「있는 척만」 하는 브라우저에서는 시작 전에 알린다 */}
              {!recording && !browser.speechOk && (
                <p className="text-caption text-alert mt-1.5 leading-relaxed">
                  ⚠️ <strong className="font-semibold">「{browser.name}」에는 실제로 받아써 주는
                  기능이 없을 수 있습니다.</strong> 마이크는 열리는데 글자가 안 나오는 식입니다.
                  크롬에서 열어 보시거나, 아래 「소리도 함께 담아 두기」를 켜고 진행하세요.
                </p>
              )}

              {/*
                ⚠️ 받아쓰기가 글자를 못 내놓으면 **그동안 한 말이 통째로 사라진다.**
                소리는 어디에도 저장되지 않고 흘러가기 때문이다. 그래서 소리를 따로 담아 둔다.
                이 소리는 이 브라우저 안에만 있고 서버로 안 간다 — 요금 0원.
              */}
              {!recording && (
                <label className="flex items-start gap-2 text-caption mt-2">
                  <input
                    type="checkbox"
                    checked={keepAudio}
                    onChange={(e) => setKeepAudio(e.target.checked)}
                    className="accent-action mt-1 shrink-0"
                  />
                  <span className="text-ink-soft">
                    음성 파일 함께 보관 <span className="text-ink-mute">(안전장치)</span>
                    <span className="block text-ink-mute leading-relaxed mt-0.5">
                      받아쓰기가 실패하더라도 <strong className="font-semibold">회의 내용이 유실되지
                      않습니다.</strong> 종료 후 음성 파일을 내려받을 수 있으며, 이 음성은 외부로
                      전송되지 않고 비용도 발생하지 않습니다.
                    </span>
                  </span>
                </label>
              )}
            </div>
          )}

          {/*
            좁은 화면에서는 **버튼이 아랫줄로 내려간다.**
            한 줄에 밀어 넣었더니 폰에서 「듣는 중」이 한 글자씩 세로로 늘어섰다 —
            글자를 안 쪼개려면 줄을 넘기는 수밖에 없다.
          */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${
                listening ? 'bg-action animate-pulse' : 'bg-hairline'
              }`}
              aria-hidden
            />
            <span className="text-body font-semibold whitespace-nowrap">
              {listening ? '받아쓰는 중' : paused ? '일시정지' : finished ? '회의 종료' : '대기'}
            </span>
            <span className="text-tagline tabular-nums font-semibold text-ink whitespace-nowrap">
              {clock(live.elapsedMs)}
            </span>
            {!idle && (
              <span className="text-caption text-ink-mute whitespace-nowrap">{way}</span>
            )}
            {stats.lines > 0 && (
              <span className="text-caption text-ink-mute whitespace-nowrap">
                {stats.lines}줄 · {stats.chars.toLocaleString()}자
              </span>
            )}

            {/*
              ⚠️ 폰에서는 **버튼을 통째로 아랫줄로 내린다.**
              한 줄에 두었더니 「잠깐」 버튼이 시간을 덮어 **몇 분째 녹음 중인지가 안 보였다.**
              회의 중에 제일 자주 보는 숫자가 그것이다. 좁으면 줄을 나눈다
            */}
            <div className="w-full sm:w-auto sm:ml-auto flex justify-end gap-2 shrink-0">
              {idle && (
                <PillButton type="button" onClick={() => void begin()}>
                  받아쓰기 시작
                </PillButton>
              )}
              {listening && (
                <>
                  <PillButton type="button" variant="ghost" onClick={hold}>
                    일시정지
                  </PillButton>
                  <PillButton type="button" onClick={finish}>
                    종료
                  </PillButton>
                </>
              )}
              {paused && (
                <>
                  <PillButton type="button" onClick={() => void again()}>
                    이어서 진행
                  </PillButton>
                  <PillButton type="button" variant="ghost" onClick={finish}>
                    종료
                  </PillButton>
                </>
              )}
              {finished && (
                <PillButton type="button" variant="ghost" onClick={() => void again()}>
                  다시 시작
                </PillButton>
              )}
            </div>
          </div>

          {/* ── 지금 듣고 있는가 ─────────────────────────
              *"듣고 있는 건지 모르겠다"* 가 나왔던 자리다.
              녹음 쪽은 **소리 막대**로, 브라우저 쪽은 **단계**로 보여 준다 */}
          {(listening || paused) && (
            <div className="mt-3">
              {recording ? (
                <div className="flex items-center gap-3">
                  <span className="text-caption text-ink-mute shrink-0">소리</span>
                  <div className="flex-1 h-2 bg-parchment rounded-full overflow-hidden">
                    <div
                      className="h-full bg-action rounded-full transition-[width] duration-100"
                      style={{ width: `${Math.round(recorder.level * 100)}%` }}
                    />
                  </div>
                  {/*
                    ⚠️ 여기에 「45초마다 올라옵니다」라고만 적혀 있었다.
                    그 45초 동안 글자가 한 자도 안 올라와서 **고장 난 줄 아셨다**(2026-08-19).
                    이제 토막을 15초로 줄이고, **남은 초를 세어 보여 준다** —
                    기다리는 시간과 고장 난 시간을 사람이 구분할 수 있어야 한다.
                  */}
                  <span className="text-caption text-ink-mute shrink-0 tabular-nums">
                    {pending > 0
                      ? `받아쓰는 중 ${pending}`
                      : stats.lines === 0
                        ? `첫 글 ${recorder.nextInSec}초 뒤`
                        : `다음 글 ${recorder.nextInSec}초 뒤`}
                  </span>
                </div>
              ) : (
                <p className="text-caption text-ink-mute leading-relaxed">
                  받아쓰기 장치: <strong className="font-semibold">{stageLabel(live.stage)}</strong>
                  {live.phrase && ' · 한 마디씩 받는 중'}
                  {stats.lines === 0 && live.noTextSec > 5 && (
                    <strong className="font-semibold"> · 아직 글자 없음 {live.noTextSec}초째</strong>
                  )}
                  <span className="block text-ink-mute mt-0.5">
                    {browser.name} · 시도 {live.attempts}회
                  </span>
                  {/* 삼켜 버리던 신호를 보여 준다. 「왜 안 되는지 모르겠다」를 없애는 자리 */}
                  {live.signal && (
                    <span className="block text-ink-mute mt-0.5">신호: {live.signal}</span>
                  )}
                </p>
              )}

              {/*
                조용해서 안 보낸 토막을 **밝힌다.**

                안 밝히면 이번엔 「글이 안 늘어난다 = 고장」이 된다.
                방금 그 문제로 45초를 고쳤는데 같은 자리를 다시 팔 수는 없다.
                조용한 토막은 보내면 없는 말이 지어지므로 **안 보내는 게 맞고**,
                다만 그 사실은 보여 준다.
              */}
              {recording && recorder.skippedQuiet > 0 && (
                <p className="text-caption text-ink-mute mt-1.5 leading-relaxed">
                  말이 없던 구간 {recorder.skippedQuiet}개는 보내지 않았습니다 — 조용한 소리를
                  보내면 <strong className="font-semibold">없는 말이 지어집니다.</strong>
                </p>
              )}
            </div>
          )}

          {/* 소리는 들어오는데 글자가 안 나오면 다른 길을 권한다 */}
          {/* 잘 안 될 때 **사람이 직접** 방식을 바꾼다. 툴이 알아서 끊지 않는다 */}
          {!recording && listening && stats.lines === 0 && live.noTextSec >= 12 && !live.phrase && (
            <div className="mt-3 bg-parchment rounded-md px-3.5 py-3">
              <p className="text-caption text-ink-soft leading-relaxed">
                {live.noTextSec}초째 글자가 없습니다. 말을 한 마디씩 끊어 받는 방식으로 바꿔 볼 수 있습니다.
              </p>
              <button
                type="button"
                onClick={live.switchToPhrase}
                className="text-caption text-action font-semibold mt-1.5"
              >
                한 마디씩 받는 방식으로 바꾸기 →
              </button>
            </div>
          )}

          {!recording && listening && stats.lines === 0 && live.noTextSec >= 40 && (
            <div className="mt-3 bg-parchment rounded-md px-3.5 py-3">
              <p className="text-caption text-ink-soft leading-relaxed">
                {live.noTextSec}초가 지나도 <strong className="font-semibold">글자가 한 줄도 안
                올라옵니다.</strong> 방식을 바꿔 다시 해 봤는데도 그렇습니다 — 이 브라우저의 받아쓰기가
                안 되는 것으로 보입니다.
              </p>
              {keepAudio ? (
                <p className="text-caption text-ink-mute mt-1.5 leading-relaxed">
                  ✅ <strong className="font-semibold">소리는 담기고 있습니다.</strong> 회의는 안
                  유실되지 않습니다. 저장하면 서버에 보관되며, 이후 언제든 다시 변환할 수 있습니다.
                </p>
              ) : (
                <>
                  <p className="text-caption text-alert mt-1.5 leading-relaxed">
                    ⚠️ 「소리도 함께 담아 두기」가 꺼져 있어{' '}
                    <strong className="font-semibold">지금 하신 말은 남지 않습니다.</strong>
                  </p>
                  {/*
                    회의를 끊지 않고 그 자리에서 켠다.
                    「끝내고 다시 시작하세요」라고만 적어 뒀더니 그동안 한 말이 계속 사라졌다
                  */}
                  <button
                    type="button"
                    onClick={() => {
                      setKeepAudio(true)
                      void safety.start(live.elapsedNow)
                    }}
                    className="text-caption text-action font-semibold mt-1"
                  >
                    지금부터라도 소리 담기 →
                  </button>
                </>
              )}
              <p className="text-caption text-ink-mute mt-1.5 leading-relaxed">
                녹음 방식으로 바꾸면 서버가 받아씁니다. 다만{' '}
                <strong className="font-semibold">AI 크레딧이 있어야</strong> 돕니다.
              </p>
              <button
                type="button"
                onClick={() => {
                  finish()
                  setWay('🎧 녹음')
                }}
                className="text-caption text-action font-semibold mt-1.5"
              >
                🎧 녹음해서 받아쓰기로 바꾸기 →
              </button>
            </div>
          )}

          <p className="text-caption text-ink-mute mt-3 leading-relaxed">
            ⚠️ 받아쓰기를 시작하면{' '}
            <strong className="font-semibold">
              음성이 {recording ? 'AI 공급자' : '브라우저 제조사'} 서버로 나갑니다.
            </strong>{' '}
            회생·인사 회의라면 옆의 「민감 회의」를 켜 두세요 — 막지는 않지만, 나중에 그 표시로
            골라내 정리할 수 있습니다.
          </p>

          {recNote && (
            <p className="text-caption text-alert mt-2 leading-relaxed">
              토막 하나를 못 받아썼습니다 — {recNote}{' '}
              <button type="button" onClick={() => setRecNote(null)} className="underline">
                닫기
              </button>
            </p>
          )}
          {recorder.error && (
            <p className="text-caption text-alert mt-2 leading-relaxed">
              {recorder.error}{' '}
              <button type="button" onClick={recorder.clearError} className="underline">
                닫기
              </button>
            </p>
          )}

          {live.error && (
            <p className="text-caption text-alert mt-2 leading-relaxed">
              {live.error}{' '}
              <button type="button" onClick={live.clearError} className="underline">
                닫기
              </button>
            </p>
          )}
        </Card>

        {/*
          ── 안내·점검은 본문 **바로 위**에 ────────────────────
          오른쪽 곁칸에 두었더니 「이 회의」만큼 자리를 차지해 눈이 그리로 갔다.
          이건 **안 될 때만 펴 보는 것**이라 본문 흐름 위에 한 줄로 두는 편이 맞다.
        */}
        {!recording && <SpeechCheck />}

        <Card
          title="받아쓴 내용"
          count={stats.lines}
          action={
            (listening || paused) &&
            live.segments.length > 0 && (
              <button
                type="button"
                onClick={() => live.setSegments((s) => toggleMark(s, s.length - 1))}
                className="text-caption text-action font-semibold"
              >
                ★ 중요 표시
              </button>
            )
          }
        >
          {live.segments.length === 0 && !live.interim ? (
            <EmptyState
              message={idle ? '아직 시작하지 않았습니다.' : '음성 입력을 기다리는 중입니다.'}
              hint={idle ? '회의명을 입력한 뒤 「받아쓰기 시작」을 누르세요.' : undefined}
            />
          ) : (
            <div ref={listRef} className="max-h-[420px] overflow-y-auto -mx-1 px-1">
              <ul className="space-y-1">
                {live.segments.map((s, i) => (
                  <Line
                    key={`${s.at}-${i}`}
                    seg={s}
                    onMark={() => live.setSegments((prev) => toggleMark(prev, i))}
                    onEdit={(v) => live.setSegments((prev) => editSegment(prev, i, v))}
                  />
                ))}
              </ul>
              {live.interim && (
                <p className="text-body text-ink-mute mt-1 pl-[68px] leading-relaxed">
                  {live.interim}…
                </p>
              )}
            </div>
          )}
        </Card>

        {/*
          ── 저장 자리 ─────────────────────────────────────
          받아쓴 내용 **바로 아래**에 둔다. 예전에는 초안 카드 밑에 있어서
          「초안을 만들어야 저장되는 것」처럼 보였다. 저장은 초안과 상관없이 언제든 된다.
        */}
        {finished && (
          <div className="flex flex-wrap items-center gap-2">
            <PillButton
              type="button"
              disabled={save.isPending}
              onClick={() => {
                if (!meta.title.trim()) {
                  setDone(null)
                  titleRef.current?.focus()
                  return
                }
                save.mutate()
              }}
            >
              {save.isPending ? '저장하는 중…' : '회의록 저장'}
            </PillButton>
            <PillButton type="button" variant="ghost" onClick={clearAll}>
              삭제
            </PillButton>
            {!meta.title.trim() ? (
              <span className="text-caption text-alert">
                오른쪽 <strong className="font-semibold">「회의명」</strong>을 입력해야 저장됩니다.
              </span>
            ) : live.segments.length === 0 ? (
              <span className="text-caption text-ink-mute">
                전사문 없이 회의명·참석자·메모만 저장됩니다.
              </span>
            ) : (
              <span className="text-caption text-ink-mute">
                저장한 뒤 「📋 지난 회의록」에서 초안을 작성할 수 있습니다.
              </span>
            )}
            {save.isError && (
              <span className="text-caption text-alert">{(save.error as Error).message}</span>
            )}
          </div>
        )}

        {/* ── 회의가 끝나면: 초안 ─────────────────────── */}
        {(audio || failed.length > 0) && finished && (
          <Card title="보관 중인 음성">
            {audio && (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-body text-ink-soft">
                  이번 회의 음성을 보관했습니다{' '}
                  <span className="text-caption text-ink-mute">
                    ({Math.round(audio.size / 1024 / 1024 * 10) / 10}MB)
                  </span>
                </span>
                <PillButton
                  type="button"
                  variant="ghost"
                  onClick={() => downloadBlob(audio, `${meta.met_on}-${meta.title || '회의'}`)}
                >
                  음성 내려받기
                </PillButton>
              </div>
            )}
            {audio && (
              <>
                <label className="flex items-start gap-2 text-caption mt-3">
                  <input
                    type="checkbox"
                    checked={willUploadAudio}
                    onChange={(e) => setUploadAudio(e.target.checked)}
                    className="accent-action mt-1 shrink-0"
                  />
                  <span className="text-ink-soft">
                    <strong className="font-semibold">「회의록 저장」 시 이 음성도 함께 보관</strong>
                    <span className="block text-ink-mute leading-relaxed mt-0.5">
                      서버에 올라갑니다. 이 경우 <strong className="font-semibold">다른 기기에서도</strong>{' '}
                      해당 회의록을 열어 다시 변환할 수 있습니다. 문자 변환이 완료되면 음성은 자동으로
                      삭제됩니다.
                    </span>
                  </span>
                </label>

                <p className="text-caption text-alert mt-2 leading-relaxed">
                  ⚠️ 아직 <strong className="font-semibold">이 브라우저 안에만</strong> 있습니다.{' '}
                  {willUploadAudio
                    ? '「회의록 저장」을 누르면 서버에 보관됩니다. 저장하지 않고 이 화면을 벗어나면 삭제됩니다.'
                    : '위 항목을 선택하지 않으면 저장해도 음성은 보관되지 않습니다.'}
                </p>
              </>
            )}

            {failed.length > 0 && (
              <div className={audio ? 'mt-4 pt-4 border-t border-hairline' : ''}>
                <p className="text-body text-ink-soft">
                  변환하지 못한 구간 <strong className="font-semibold">{failed.length}개</strong>가
                  남아 있습니다.
                </p>
                <p className="text-caption text-ink-mute mt-1 leading-relaxed">
                  AI 사용 한도로 실패한 경우, 충전 후 다시 시도하면 해당 구간이 복구됩니다.
                </p>
                <PillButton
                  type="button"
                  variant="ghost"
                  className="mt-2"
                  disabled={pending > 0}
                  onClick={() => void retryFailed()}
                >
                  {pending > 0 ? '변환 중…' : '다시 변환'}
                </PillButton>
              </div>
            )}
          </Card>
        )}

        {finished && live.segments.length === 0 && (
          <Card title="받아쓴 글이 없습니다">
            <p className="text-body text-ink-soft leading-relaxed">
              받아쓰기가 글자를 내놓지 못했습니다. <strong className="font-semibold">그래도 저장할 수
              있습니다</strong> — 제목·참석·장소와 회의 중 적으신 메모는 그대로 남습니다.
            </p>
            <p className="text-caption text-ink-mute mt-2 leading-relaxed">
              나중에 「📋 지난 회의록」에서 그 회의를 열어 받아쓴 글을 직접 붙여넣거나 손으로 적을 수
              있습니다. 버리실 거면 아래 「삭제」를 누르세요.
            </p>
          </Card>
        )}

        {finished && live.segments.length > 0 && (
          <Card title="회의록 초안">
            {!draft ? (
              <>
                <p className="text-body text-ink-soft leading-relaxed">
                  받아쓴 글을 AI 가 <strong className="font-semibold">요약 · 결정 · 할 일 · 확인 필요</strong>
                  {' '}네 칸으로 정리합니다.
                </p>
                <p className="text-caption text-ink-mute mt-2 leading-relaxed">
                  받아쓰기는 사람 이름·사내 용어에서 틀립니다. AI 가 이상한 대목을 「확인 필요」에 짚어 줍니다.
                  {glossary && glossary.length > 0 && ` 사내 용어집 ${glossary.length}개 중 이 회의에 나온 것만 함께 넘깁니다.`}
                </p>
                <div className="mt-4">
                  <PillButton type="button" onClick={() => ask.mutate()} disabled={ask.isPending}>
                    {ask.isPending ? '정리하는 중…' : '회의록 초안 만들기'}
                  </PillButton>
                </div>
                {ask.isError && (
                  <p className="text-caption text-alert mt-3">{(ask.error as Error).message}</p>
                )}
              </>
            ) : (
              <div className="space-y-4">
                {draft.truncated && (
                  <p className="text-caption text-alert">
                    회의가 길어 뒷부분은 정리에서 빠졌습니다. 받아쓴 글 전체는 그대로 저장됩니다.
                  </p>
                )}

                <Field label="안건 · 요약" hint="AI 초안입니다. 고쳐서 저장하세요">
                  <TextArea
                    rows={4}
                    value={fix.agenda}
                    onChange={(e) => setFix((p) => ({ ...p, agenda: e.target.value }))}
                  />
                </Field>

                <Field label="결정사항">
                  <TextArea
                    rows={3}
                    value={fix.decisions}
                    onChange={(e) => setFix((p) => ({ ...p, decisions: e.target.value }))}
                  />
                </Field>

                <div>
                  <p className="text-caption text-ink-soft mb-1.5">
                    할 일 <span className="text-ink-mute">— 체크한 것만 인박스로 갑니다</span>
                  </p>
                  {todos.length === 0 ? (
                    <p className="text-caption text-ink-mute">AI 가 뽑은 할 일이 없습니다.</p>
                  ) : (
                    <ul className="space-y-2">
                      {todos.map((t, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={t.take}
                            onChange={() =>
                              setTodos((prev) =>
                                prev.map((x, j) => (j === i ? { ...x, take: !x.take } : x)),
                              )
                            }
                            className="accent-action mt-1.5 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <TextInput
                              value={t.text}
                              onChange={(e) =>
                                setTodos((prev) =>
                                  prev.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)),
                                )
                              }
                            />
                            {/* 분류가 붙었으면 보여 준다 — 이게 그대로 업무의 영역이 되므로
                                인박스에 가기 전에 눈으로 확인할 수 있어야 한다 */}
                            {t.area && (
                              <p className="text-caption text-ink-mute mt-1">
                                분류 <strong className="font-semibold">{t.area}</strong> — 업무의 영역으로
                                이어집니다
                              </p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {draft.minutes.checks.length > 0 && (
                  <div>
                    <p className="text-caption text-ink-soft mb-1.5">
                      확인 필요 <span className="text-ink-mute">— 잘못 들렸을 수 있는 대목</span>
                    </p>
                    <ul className="space-y-1">
                      {draft.minutes.checks.map((c, i) => (
                        <li key={i} className="text-body text-ink-soft leading-relaxed">
                          · {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {draft.minutes.summary.length === 0 && draft.minutes.decisions.length === 0 && (
                  <div>
                    <p className="text-caption text-ink-mute mb-1.5">
                      AI 답을 칸으로 나누지 못했습니다. 원문을 그대로 둡니다.
                    </p>
                    <pre className="text-caption text-ink-soft whitespace-pre-wrap leading-relaxed bg-parchment rounded-md p-3">
                      {draft.text}
                    </pre>
                  </div>
                )}

                <details>
                  <summary className="text-caption text-ink-mute cursor-pointer">
                    AI 가 준 원문 보기 ({draft.model})
                  </summary>
                  <pre className="text-caption text-ink-soft whitespace-pre-wrap leading-relaxed bg-parchment rounded-md p-3 mt-2">
                    {draft.text}
                  </pre>
                </details>
              </div>
            )}
          </Card>
        )}

      </div>

      {/* ── 오른쪽: 내가 적는 것 ───────────────────────── */}
      <div className="space-y-5">
        <Card title="이 회의">
          <div className="space-y-3">
            <Field label="회의명">
              <TextInput
                ref={titleRef}
                value={meta.title}
                onChange={(e) => setMeta((p) => ({ ...p, title: e.target.value }))}
                placeholder="예: 자재 단가 협의"
              />
            </Field>
            <Field label="일자">
              <TextInput
                type="date"
                value={meta.met_on}
                onChange={(e) => setMeta((p) => ({ ...p, met_on: e.target.value }))}
              />
            </Field>
            <Field label="참석자" hint="역할로 적습니다">
              <TextInput
                value={meta.attendees}
                onChange={(e) => setMeta((p) => ({ ...p, attendees: e.target.value }))}
                placeholder="예: 대표, 구매사업본부 담당자"
              />
            </Field>
            <Field label="장소/방식">
              <TextInput
                value={meta.place}
                onChange={(e) => setMeta((p) => ({ ...p, place: e.target.value }))}
              />
            </Field>

            {/*
              ── 왜 막지 않고 표시만 하나 ────────────────────────────
              설계서 §5.8 은 민감 회의에서 받아쓰기를 **잠그게** 되어 있었다.
              사용자 판단으로 풀었다 — *"민감회의도 일반회의와 같은 루트로,
              보안은 나중에 생각하자"* (2026-08-16).

              대신 **표시는 남긴다.** 이 표시가 있어야 나중에 정책을 다시 세울 때
              "그동안 쌓인 민감 회의가 어느 것이냐"를 골라낼 수 있다.
              표시조차 없으면 그때 전부 뒤져야 한다.
            */}
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
                  표시만 해 둡니다. 받아쓰기는 그대로 쓸 수 있고 저장도 똑같이 됩니다 —
                  나중에 이 표시로 골라내 따로 정리하기 위한 것입니다.
                </span>
              </span>
            </label>
          </div>
        </Card>

        <Card title="내 메모">
          <p className="text-caption text-ink-mute mb-2 leading-relaxed">
            말로 안 나온 것 — 내 판단, 확인할 것. 받아쓴 말과 섞이지 않게 따로 담깁니다.
          </p>
          <TextArea rows={8} value={myNotes} onChange={(e) => setMyNotes(e.target.value)} />
        </Card>
      </div>
    </div>
  )
}

/**
 * 소리 파일을 내려받게 한다.
 *
 * 브라우저가 만든 소리는 **이 화면을 벗어나면 사라진다.** 서버에 안 올리기 때문이다
 * (요금·유출을 피하려고 일부러 그렇게 뒀다). 그래서 사람이 직접 받아 둘 길을 낸다.
 */
function downloadBlob(blob: Blob, name: string) {
  const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}.${ext}`
  a.click()
  // 곧바로 지우면 내려받기가 끊긴다. 잠시 뒤 치운다
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** 받아쓰기 장치의 단계를 사람 말로 */
function stageLabel(stage: string): string {
  switch (stage) {
    case '켜짐':
      return '켜짐 (아직 소리 없음)'
    case '소리들어옴':
      return '소리 들어오는 중'
    case '말소리감지':
      return '말소리 감지됨'
    case '글자나옴':
      return '글자 받아쓰는 중'
    default:
      return '꺼짐'
  }
}

/**
 * 받아쓴 줄 하나.
 *
 * 클릭하면 그 자리에서 고친다 — 받아쓰기는 사람 이름·사내 용어에서 자주 틀리는데,
 * 회의가 끝난 뒤에 고치려면 무슨 말이었는지 기억이 안 난다.
 */
function Line({
  seg,
  onMark,
  onEdit,
}: {
  seg: Segment
  onMark: () => void
  onEdit: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(seg.text)

  if (editing) {
    return (
      <li className="flex items-start gap-2">
        <span className="text-caption text-ink-mute tabular-nums w-[60px] shrink-0 pt-2.5">
          {clock(seg.at)}
        </span>
        <TextInput
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onEdit(value)
              setEditing(false)
            }
            if (e.key === 'Escape') {
              setValue(seg.text)
              setEditing(false)
            }
          }}
          onBlur={() => {
            onEdit(value)
            setEditing(false)
          }}
        />
      </li>
    )
  }

  return (
    <li className="group flex items-start gap-2">
      <span className="text-caption text-ink-mute tabular-nums w-[60px] shrink-0 pt-0.5">
        {clock(seg.at)}
      </span>
      <button
        type="button"
        onClick={() => {
          // 지금 화면에 보이는 글로 시작한다. 이 줄은 뒤에 이어진 말이 합쳐지며
          // 바뀌어 있을 수 있는데, 처음 값만 들고 있으면 옛 글이 뜬다
          setValue(seg.text)
          setEditing(true)
        }}
        className={`text-body text-left leading-relaxed flex-1 ${
          seg.mark ? 'font-semibold' : 'text-ink-soft'
        }`}
      >
        {seg.mark && <span className="text-action mr-1">★</span>}
        {seg.text}
      </button>
      <button
        type="button"
        onClick={onMark}
        className="text-caption text-ink-mute opacity-0 group-hover:opacity-100 hover:text-action shrink-0 pt-0.5"
      >
        {seg.mark ? '중요 해제' : '★ 중요'}
      </button>
    </li>
  )
}
