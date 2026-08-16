import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, EmptyState } from '../../components/ui'
import { Field, PillButton, TextArea, TextInput } from '../../components/Field'
import { ymd } from '../../domain/daily'
import {
  clock,
  editSegment,
  parseMinutes,
  toggleMark,
  transcriptStats,
  transcriptText,
  usedGlossary,
} from '../../domain/transcript'
import type { Minutes, Segment } from '../../domain/transcript'
import { useCompanyId } from '../companies/useCompany'
import { useLiveTranscript } from './useLiveTranscript'
import { useRecorder } from './useRecorder'
import { callMinutes, loadGlossary, saveLiveMeeting, transcribeChunk } from './api'
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
 *                45초마다 글이 올라오고, 기기를 안 가리며, 사내 용어를 미리 알려 줄 수 있다.
 *                대신 소리 길이만큼 요금이 붙는다
 */
const WAYS = ['⚡ 브라우저', '🎧 녹음'] as const
type Way = (typeof WAYS)[number]

/** 손가락으로 쓰는 기기인가. 폰·태블릿이면 처음부터 녹음 쪽을 고른다 */
function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true
}

type Meta = { met_on: string; title: string; place: string; attendees: string }
type Saved = { meta: Meta; segments: Segment[]; elapsedMs: number; myNotes: string }
type Draft = { text: string; minutes: Minutes; model: string; truncated?: boolean }

export default function LiveMeeting() {
  const companyId = useCompanyId()
  const qc = useQueryClient()
  const live = useLiveTranscript()

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
  const [todos, setTodos] = useState<{ text: string; take: boolean }[]>([])
  const [recovered, setRecovered] = useState<Saved | null>(null)
  const [done, setDone] = useState<string | null>(null)

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

  const { data: glossary } = useQuery({
    queryKey: ['glossary', companyId],
    queryFn: () => loadGlossary(companyId as string),
    enabled: !!companyId,
  })

  const listRef = useRef<HTMLDivElement>(null)
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
        const got = await transcribeChunk(blob, termHint)
        if (got) setSegments((prev) => appendFinal(prev, got, atMs))
      } catch (e) {
        // 토막 하나가 실패해도 회의는 계속돼야 한다. 알리기만 하고 넘어간다
        setRecNote(e instanceof Error ? e.message : String(e))
      } finally {
        setPending((n) => n - 1)
      }
    },
    [termHint, setSegments],
  )
  const recorder = useRecorder(handleChunk)
  const recordOk = recorder.supported && live.secure

  // ── 브라우저에 임시 저장 ────────────────────────────────
  // 회의 중에 탭이 닫히면 한 시간이 통째로 날아간다. 그래서 계속 적어 둔다.
  // (이 글은 이 컴퓨터의 브라우저에만 있다. 저장을 눌러야 서버로 간다)
  useEffect(() => {
    if (live.segments.length === 0) return
    const payload: Saved = { meta, segments: live.segments, elapsedMs: live.elapsedMs, myNotes }
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
      })
    },
    onSuccess: (reply) => {
      const minutes = parseMinutes(reply.text)
      setDraft({ text: reply.text, minutes, model: reply.model, truncated: reply.truncated })
      setFix({
        agenda: minutes.summary.join('\n'),
        decisions: minutes.decisions.join('\n'),
      })
      setTodos(minutes.followUps.map((t) => ({ text: t, take: true })))
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
        aiDraft: draft ? { text: draft.text, minutes: draft.minutes, model: draft.model } : null,
        followUps: todos.filter((t) => t.take).map((t) => t.text),
        sensitive,
        source: way === '🎧 녹음' ? '녹음전사' : '실시간받아쓰기',
      })
    },
    onSuccess: () => {
      const 담긴수 = todos.filter((t) => t.take).length
      setDone(
        담긴수 > 0
          ? `회의록을 저장했습니다. 할 일 ${담긴수}건을 인박스로 보냈습니다.`
          : '회의록을 저장했습니다.',
      )
      clearAll()
      void qc.invalidateQueries({ queryKey: ['meetings'] })
      void qc.invalidateQueries({ queryKey: ['inbox'] })
    },
  })

  function clearAll() {
    recorder.stop()
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

  const listening = live.status === '듣는중'
  const paused = live.status === '멈춤'
  const finished = live.status === '끝'
  const idle = live.status === '준비'
  const recording = way === '🎧 녹음'

  // ── 듣기 시작·멈춤 — 고른 길에 따라 갈린다 ──────────────
  async function begin() {
    setRecNote(null)
    if (recording) {
      live.startTimer()
      const ok = await recorder.start(live.elapsedNow)
      if (!ok) live.pause()
    } else {
      live.start()
    }
  }
  async function again() {
    if (recording) {
      live.resumeTimer()
      const ok = await recorder.start(live.elapsedNow)
      if (!ok) live.pause()
    } else {
      live.resume()
    }
  }
  function hold() {
    recorder.stop()
    live.pause()
  }
  function finish() {
    recorder.stop()
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
                버리기
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
                  ? '녹음한 소리를 45초마다 서버로 보내 글로 바꿉니다. 어느 폰·태블릿에서도 되고, 사내 용어를 미리 알려 줍니다. 소리 길이만큼 요금이 붙습니다.'
                  : '브라우저에 들어 있는 받아쓰기를 씁니다. 공짜이고 말하는 즉시 글자가 올라옵니다. 다만 폰에서는 잘 안 될 수 있습니다.'}
              </p>
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
              {listening ? '듣는 중' : paused ? '잠깐 멈춤' : finished ? '회의 끝' : '대기'}
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
                  듣기 시작
                </PillButton>
              )}
              {listening && (
                <>
                  <PillButton type="button" variant="ghost" onClick={hold}>
                    잠깐
                  </PillButton>
                  <PillButton type="button" onClick={finish}>
                    끝내기
                  </PillButton>
                </>
              )}
              {paused && (
                <>
                  <PillButton type="button" onClick={() => void again()}>
                    이어서 듣기
                  </PillButton>
                  <PillButton type="button" variant="ghost" onClick={finish}>
                    끝내기
                  </PillButton>
                </>
              )}
              {finished && stats.lines > 0 && (
                <PillButton type="button" variant="ghost" onClick={() => void again()}>
                  다시 듣기
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
                  <span className="text-caption text-ink-mute shrink-0 tabular-nums">
                    {pending > 0 ? `받아쓰는 중 ${pending}` : '45초마다 올라옵니다'}
                  </span>
                </div>
              ) : (
                <p className="text-caption text-ink-mute">
                  받아쓰기 장치: <strong className="font-semibold">{stageLabel(live.stage)}</strong>
                  {live.stage === '소리들어옴' || live.stage === '말소리감지'
                    ? ' — 소리는 들어오는데 아직 글자가 안 나왔습니다.'
                    : ''}
                </p>
              )}
            </div>
          )}

          {/* 소리는 들어오는데 글자가 안 나오면 다른 길을 권한다 */}
          {!recording && listening && stats.lines === 0 && live.stage === '말소리감지' && (
            <div className="mt-3 bg-parchment rounded-md px-3.5 py-3">
              <p className="text-caption text-ink-soft leading-relaxed">
                말소리는 잡히는데 <strong className="font-semibold">글자가 안 올라옵니다.</strong>{' '}
                이 브라우저의 받아쓰기가 안 되는 것으로 보입니다.
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
            ⚠️ 듣기 시작을 누르면{' '}
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

        <Card
          title="받아쓴 말"
          count={stats.lines}
          action={
            (listening || paused) &&
            live.segments.length > 0 && (
              <button
                type="button"
                onClick={() => live.setSegments((s) => toggleMark(s, s.length - 1))}
                className="text-caption text-action font-semibold"
              >
                ★ 지금 중요
              </button>
            )
          }
        >
          {live.segments.length === 0 && !live.interim ? (
            <EmptyState
              message={idle ? '아직 듣지 않았습니다.' : '말을 기다리는 중입니다.'}
              hint={idle ? '제목을 적고 「듣기 시작」을 누르세요.' : undefined}
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

        {/* ── 회의가 끝나면: 초안 ─────────────────────── */}
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
                          <TextInput
                            value={t.text}
                            onChange={(e) =>
                              setTodos((prev) =>
                                prev.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)),
                              )
                            }
                          />
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

        {finished && live.segments.length > 0 && (
          <div className="flex items-center gap-2">
            <PillButton
              type="button"
              onClick={() => save.mutate()}
              disabled={!meta.title.trim() || save.isPending}
            >
              {save.isPending ? '저장하는 중…' : '회의록 저장'}
            </PillButton>
            <PillButton type="button" variant="ghost" onClick={clearAll}>
              버리기
            </PillButton>
            {!meta.title.trim() && (
              <span className="text-caption text-ink-mute">제목을 적어야 저장됩니다.</span>
            )}
            {save.isError && (
              <span className="text-caption text-alert">{(save.error as Error).message}</span>
            )}
          </div>
        )}
      </div>

      {/* ── 오른쪽: 내가 적는 것 ───────────────────────── */}
      <div className="space-y-5">
        <Card title="이 회의">
          <div className="space-y-3">
            <Field label="제목">
              <TextInput
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
            <Field label="참석" hint="역할로 적습니다">
              <TextInput
                value={meta.attendees}
                onChange={(e) => setMeta((p) => ({ ...p, attendees: e.target.value }))}
                placeholder="예: 대표, 구매사업본부 담당자"
              />
            </Field>
            <Field label="장소">
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
