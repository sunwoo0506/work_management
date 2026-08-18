import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Row } from '../../lib/supabase'
import { Field, PillButton, TextArea, TextInput } from '../../components/Field'
import { clock, hhmm, mergeIntoTranscript, timeRange, usedGlossary } from '../../domain/transcript'
import {
  EMPTY_MINUTES,
  mergeMinutes,
  minutesToText,
  parseMinutesDoc,
  splitTranscript,
} from '../../domain/minutes'
import type { ActionItem, MinutesDoc } from '../../domain/minutes'
import MinutesForm from './MinutesForm'
import { useCompanyId } from '../companies/useCompany'
import {
  callMinutes,
  deleteMeeting,
  deleteMeetingAudio,
  fetchMeetingAudio,
  listMeetingAudio,
  loadGlossary,
  sendToInbox,
  transcribeChunk,
  updateMeeting,
  updateMeetingHead,
} from './api'
import type { MeetingAudio } from './api'
import { useRegisteredAreas } from '../areas/useAreaOptions'
import { printMinutes } from './printMinutes'

type Meeting = Row<'meetings'>

/**
 * 회의록 하나 — 펼쳐서 **보고 · 고치고 · 초안을 만들고 · 일로 넘기는** 자리.
 *
 * ── 이 화면이 있는 이유 ──────────────────────────────────
 * 처음에는 회의가 끝난 **그 자리에서만** 정리할 수 있었다. 저장하면 읽기 전용이었다.
 * 실제로는 이렇게 된다 —
 *   ① 받아쓰기가 사람 이름·사내 용어를 틀리는데 **나중에 발견한다**
 *   ② AI 크레딧이 없으면 **초안을 나중에** 만들어야 한다
 *   ③ 회의 직후에는 정신이 없다. 정리는 앉아서 나중에 한다
 *
 * ── 회의록이 일로 이어지는 자리 ──────────────────────────
 * Action Item 을 **인박스로 보내면 업무가 된다.** 회의록이 기록으로 끝나지 않는
 * 유일한 통로다. 그래서 「보내기」는 AI 초안을 만들 때뿐 아니라
 * **양식에 적혀 있으면 언제든** 눌릴 수 있어야 한다.
 */
export default function MeetingDetail({ meeting }: { meeting: Meeting }) {
  const companyId = useCompanyId()
  const qc = useQueryClient()

  const [tab, setTab] = useState<'회의록' | '전사문'>('회의록')
  const [editHead, setEditHead] = useState(false)
  const [head, setHead] = useState({
    met_on: meeting.met_on,
    title: meeting.title,
    place: meeting.place ?? '',
    attendees: meeting.attendees ?? '',
    writer: meeting.writer ?? '',
    // 저장소는 「14:00:00」로 주는데 입력칸은 「14:00」을 받는다. 한 곳에서 맞춘다
    started_at: hhmm(meeting.started_at),
    ended_at: hhmm(meeting.ended_at),
  })
  const [confirmDrop, setConfirmDrop] = useState(false)

  /** 회의록 양식 본문. 양식 이전에 만든 회의는 빈 양식으로 시작한다 */
  const [doc, setDoc] = useState<MinutesDoc>(() => asDoc(meeting.minutes))
  const [agenda, setAgenda] = useState(meeting.agenda ?? '')
  const [decisions, setDecisions] = useState(meeting.decisions ?? '')
  const [transcript, setTranscript] = useState(meeting.transcript ?? '')
  const [note, setNote] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  /** 긴 회의를 구간으로 나눠 뽑는 중일 때 「3/7 구간」을 보여 준다 */
  const [part, setPart] = useState<{ at: number; of: number } | null>(null)
  /** 인박스로 보낼 Action Item (양식의 몇 번째인가) */
  const [picked, setPicked] = useState<Set<number>>(new Set())

  const { data: glossary } = useQuery({
    queryKey: ['glossary', companyId],
    queryFn: () => loadGlossary(companyId as string),
    enabled: !!companyId,
  })

  /**
   * 회의록 분류에 쓸 업무영역.
   *
   * 여기만 **등록된 것만** 쓴다 — 업무·절차 화면과 달리 기본 갈래로 채우지 않는다.
   * 회의록 분류는 나중에 리포트의 뼈대가 되므로, 회사에 맞는 갈래를 한 번 정하고
   * 가는 편이 낫다고 봤다. 비어 있으면 분류 칸을 아예 그리지 않는다.
   */
  const areas = useRegisteredAreas()

  /**
   * 이 회의에 딸린, 아직 글이 안 된 소리들.
   * 회의록과 **같은 화면**에 둔다 — 다시 받아쓰면 그 자리에서 글이 늘어난다.
   */
  const { data: audios } = useQuery({
    queryKey: ['meeting-audio', meeting.id],
    queryFn: () => listMeetingAudio(meeting.id),
  })
  const pendingAudio = audios ?? []

  const dirty =
    agenda !== (meeting.agenda ?? '') ||
    decisions !== (meeting.decisions ?? '') ||
    transcript !== (meeting.transcript ?? '') ||
    JSON.stringify(doc) !== JSON.stringify(asDoc(meeting.minutes))

  const save = useMutation({
    mutationFn: () => updateMeeting(meeting.id, { agenda, decisions, transcript, minutes: doc }),
    onSuccess: () => {
      setNote('저장했습니다.')
      void qc.invalidateQueries({ queryKey: ['meetings'] })
    },
  })

  const saveHead = useMutation({
    mutationFn: () => updateMeetingHead(meeting.id, head),
    onSuccess: () => {
      setEditHead(false)
      setNote('회의 정보를 고쳤습니다.')
      void qc.invalidateQueries({ queryKey: ['meetings'] })
    },
  })

  /**
   * 전사 내용로 회의록 초안을 만든다.
   *
   * **긴 회의는 구간으로 나눠 뽑고 합친다.** 한 시간 반짜리 전사문은 3만 자가 넘는데,
   * 한 번에 넘기면 한도에 걸리거나 **가운데가 묽어져 앞부분 지시를 흘린다.**
   * 합치는 것은 계산으로 한다 (domain/minutes.ts).
   */
  const ask = useMutation({
    mutationFn: async () => {
      if (!transcript.trim()) throw new Error('전사문이 없습니다.')
      const chunks = splitTranscript(transcript, PART_CHARS)
      const used = usedGlossary(transcript, glossary ?? [])
      const texts: string[] = []
      const docs: MinutesDoc[] = []

      for (let i = 0; i < chunks.length; i++) {
        setPart({ at: i + 1, of: chunks.length })
        const reply = await callMinutes({
          transcript: chunks[i],
          title: meeting.title,
          attendees: meeting.attendees ?? undefined,
          agenda: agenda || undefined,
          myNotes: i === 0 ? (meeting.my_notes ?? undefined) : undefined,
          glossary: used,
          areas: areas ?? [],
          part: i + 1,
          parts: chunks.length,
        })
        texts.push(reply.text)
        // 등록된 영역 목록을 함께 넘긴다 — 목록 밖의 분류는 여기서 비워진다.
        // AI 에게 「목록에서만 고르라」고도 하지만 규칙은 안 지켜질 수 있다
        docs.push(parseMinutesDoc(reply.text, areas))
      }
      setPart(null)
      return { doc: mergeMinutes(docs), text: texts.join('\n\n---\n\n') }
    },
    onSuccess: async (reply) => {
      setDoc(reply.doc)
      // 목록에서 한 줄로 훑을 때 쓰는 요약 두 칸도 비어 있으면 채운다
      if (!agenda.trim()) setAgenda(reply.doc.agenda.join('\n'))
      if (!decisions.trim()) setDecisions(reply.doc.decisions.map((d) => d.text).join('\n'))
      setPicked(new Set(reply.doc.actions.map((_, i) => i)))

      // AI 초안 원본을 굳힌다 — 확정본과의 차이가 「AI 가 뭘 놓쳤나」를 알려주는 신호다
      await updateMeeting(meeting.id, {
        aiDraft: { text: reply.text, minutes: reply.doc as never, model: '' },
      })
      setNote('초안을 만들었습니다. 아래에서 고친 뒤 저장하세요.')
      void qc.invalidateQueries({ queryKey: ['meetings'] })
    },
    onSettled: () => setPart(null),
  })

  /** 고른 Action Item 을 인박스로 보내기 보낸다. 바로 업무로 만들지 않는다 (설계서 §5.4) */
  const push = useMutation({
    mutationFn: async () => {
      const rows = doc.actions
        .filter((_, i) => picked.has(i))
        .map((a) => ({ text: actionLine(a), area: a.area }))
        .filter((r) => r.text.trim())
      if (rows.length === 0) throw new Error('보낼 Action Item 을 선택해 주세요.')
      await sendToInbox(companyId as string, meeting.id, rows)
      await updateMeeting(meeting.id, { followUps: rows.map((r) => r.text) })
      return rows.length
    },
    onSuccess: (n) => {
      setNote(`Action Item ${n}건을 인박스로 보냈습니다. 인박스에서 업무로 올리시면 됩니다.`)
      setPicked(new Set())
      void qc.invalidateQueries({ queryKey: ['inbox'] })
      void qc.invalidateQueries({ queryKey: ['meetings'] })
    },
  })

  /** 소리 하나를 다시 받아쓴다. 성공하면 화면의 글에 곧바로 끼워 넣는다 */
  const redo = useMutation({
    mutationFn: async (row: MeetingAudio) => {
      const blob = await fetchMeetingAudio(row.path)
      const hint = (glossary ?? []).map((g) => g.term).join(', ').slice(0, 700)
      const got = await transcribeChunk(blob, hint)
      if (!got.trim()) {
        throw new Error('변환 결과가 비어 있습니다. 음성이 너무 작거나 잡음이 많을 수 있습니다.')
      }
      const merged = mergeIntoTranscript(transcript, row.at_ms, got)
      await updateMeeting(meeting.id, { transcript: merged })
      await deleteMeetingAudio(row)
      return merged
    },
    onSuccess: (merged) => {
      setTranscript(merged)
      setTab('전사문')
      setNote('변환했습니다. 전사문에서 오인식된 부분을 수정하세요.')
      void qc.invalidateQueries({ queryKey: ['meeting-audio', meeting.id] })
      void qc.invalidateQueries({ queryKey: ['meetings'] })
    },
  })

  const dropAudio = useMutation({
    mutationFn: (row: MeetingAudio) => deleteMeetingAudio(row),
    onSuccess: () => {
      setNote('음성을 삭제했습니다.')
      void qc.invalidateQueries({ queryKey: ['meeting-audio', meeting.id] })
    },
  })

  /** 회의록을 통째로 지운다. 딸린 소리 파일도 함께 사라진다 */
  const dropMeeting = useMutation({
    mutationFn: () => deleteMeeting(meeting.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['meetings'] })
      void qc.invalidateQueries({ queryKey: ['meeting-audio', meeting.id] })
    },
  })

  const readable = () =>
    minutesToText(doc, {
      title: meeting.title,
      metOn: meeting.met_on,
      place: meeting.place,
      attendees: meeting.attendees,
    })

  return (
    <div className="mt-3 space-y-4">
      {/* ── 1. 회의 기본정보 ─────────────────────────── */}
      {editHead ? (
        <div className="border border-hairline rounded-md p-3.5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-3">
            <Field label="일자">
              <TextInput
                type="date"
                value={head.met_on}
                onChange={(e) => setHead((p) => ({ ...p, met_on: e.target.value }))}
              />
            </Field>
            <Field label="회의명">
              <TextInput
                value={head.title}
                onChange={(e) => setHead((p) => ({ ...p, title: e.target.value }))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="장소/방식">
              <TextInput
                value={head.place}
                onChange={(e) => setHead((p) => ({ ...p, place: e.target.value }))}
                placeholder="예: 본사 회의실 / Zoom"
              />
            </Field>
            <Field label="참석자" hint="역할로 적습니다">
              <TextInput
                value={head.attendees}
                onChange={(e) => setHead((p) => ({ ...p, attendees: e.target.value }))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_2fr] gap-3">
            {/* 실시간 받아쓰기로 만든 회의는 이미 채워져 온다 — 손으로 적을 이유가 없다 */}
            <Field label="시작 시각">
              <TextInput
                type="time"
                value={head.started_at}
                onChange={(e) => setHead((p) => ({ ...p, started_at: e.target.value }))}
              />
            </Field>
            <Field label="종료 시각">
              <TextInput
                type="time"
                value={head.ended_at}
                onChange={(e) => setHead((p) => ({ ...p, ended_at: e.target.value }))}
              />
            </Field>
            <Field label="작성자" hint="역할로 적습니다">
              <TextInput
                value={head.writer}
                onChange={(e) => setHead((p) => ({ ...p, writer: e.target.value }))}
                placeholder="예: 경영지원부장"
              />
            </Field>
          </div>
          <div className="flex gap-2">
            <PillButton
              type="button"
              disabled={!head.title.trim() || saveHead.isPending}
              onClick={() => saveHead.mutate()}
            >
              {saveHead.isPending ? '고치는 중…' : '고침 저장'}
            </PillButton>
            <PillButton type="button" variant="ghost" onClick={() => setEditHead(false)}>
              취소
            </PillButton>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-caption text-ink-mute">
          <span>{sourceLabel(meeting.transcript_source)}</span>
          {timeRange(meeting.started_at, meeting.ended_at) && (
            <span>{timeRange(meeting.started_at, meeting.ended_at)}</span>
          )}
          {meeting.duration_sec ? <span>{clock(meeting.duration_sec * 1000)}</span> : null}
          {meeting.place && <span>{meeting.place}</span>}
          {meeting.attendees && <span>{meeting.attendees}</span>}
          {meeting.writer && <span>작성 {meeting.writer}</span>}
          {meeting.transcript && <span>{meeting.transcript.length.toLocaleString()}자</span>}
          <button
            type="button"
            onClick={() => setEditHead(true)}
            className="text-action font-semibold"
          >
            기본정보 고치기
          </button>
        </div>
      )}

      {/* ── 받아쓰지 못한 소리 ───────────────────────── */}
      {pendingAudio.length > 0 && (
        <div className="bg-parchment rounded-md p-3.5">
          <p className="text-body font-semibold">변환하지 못한 음성 {pendingAudio.length}건</p>
          <p className="text-caption text-ink-mute mt-1 leading-relaxed">
            「다시 변환」을 누르면 <strong className="font-semibold">전사문의 해당 시점에 삽입됩니다.</strong>
          </p>
          <ul className="mt-2.5 space-y-2">
            {pendingAudio.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2">
                <span className="text-caption text-ink-mute w-[132px] shrink-0">
                  {a.at_ms > 0 ? `${clock(a.at_ms)} 지점` : '회의 전체'} ·{' '}
                  {Math.max(1, Math.round((a.bytes / 1024 / 1024) * 10) / 10)}MB
                </span>
                <PillButton
                  type="button"
                  variant="ghost"
                  disabled={redo.isPending}
                  onClick={() => redo.mutate(a)}
                >
                  {redo.isPending ? '변환 중…' : '다시 변환'}
                </PillButton>
                <PillButton type="button" variant="ghost" onClick={() => void downloadAudio(a)}>
                  내려받기
                </PillButton>
                <PillButton type="button" variant="ghost" onClick={() => dropAudio.mutate(a)}>
                  지우기
                </PillButton>
              </li>
            ))}
          </ul>
          {redo.isError && (
            <p className="text-caption text-alert mt-2">{(redo.error as Error).message}</p>
          )}
        </div>
      )}

      {/* ── 두 갈래: 회의록 / 전사 내용 ──────────────── */}
      <div className="flex gap-1.5">
        {(['회의록', '전사문'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={[
              'text-caption rounded-full px-3 py-1 border',
              tab === t ? 'text-action border-action font-semibold' : 'text-ink-mute border-hairline',
            ].join(' ')}
          >
            {t}
            {t === '전사문' && !transcript.trim() && ' 없음'}
          </button>
        ))}
      </div>

      {tab === '회의록' ? (
        <div className="space-y-4">
          <MinutesForm value={doc} onChange={setDoc} areas={areas ?? []} />

          {/* ── Action Item → 인박스 ──────────────────
              회의록이 **일로 이어지는 유일한 통로**다. 그래서 AI 초안을 만든 직후만이
              아니라, 양식에 적혀 있으면 언제든 보낼 수 있어야 한다 */}
          {doc.actions.length > 0 && (
            <div className="bg-parchment rounded-md p-3.5">
              <p className="text-body font-semibold">Action Item 을 인박스로 보내기</p>
              <p className="text-caption text-ink-mute mt-1 leading-relaxed">
                선택한 항목이 인박스로 전달됩니다. 인박스에서 <strong className="font-semibold">업무로
                등록하면</strong> 기한과 중요도를 지정할 수 있습니다.{' '}
                <strong className="font-semibold">분류를 지정한 항목은 업무의 영역으로 이어집니다.</strong>
              </p>
              <ul className="mt-2.5 space-y-1.5">
                {doc.actions.map((a, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={picked.has(i)}
                      onChange={() =>
                        setPicked((prev) => {
                          const next = new Set(prev)
                          if (next.has(i)) next.delete(i)
                          else next.add(i)
                          return next
                        })
                      }
                      className="accent-action mt-1.5 shrink-0"
                    />
                    <span className="text-body text-ink-soft leading-relaxed">
                      {actionLine(a) || <span className="text-ink-mute">(내용 없음)</span>}
                      {a.area && (
                        <span className="text-caption text-ink-mute ml-1.5">[{a.area}]</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-2 mt-2.5">
                <PillButton
                  type="button"
                  variant="ghost"
                  disabled={push.isPending || picked.size === 0}
                  onClick={() => push.mutate()}
                >
                  {push.isPending ? '보내는 중…' : `인박스로 보내기 (${picked.size})`}
                </PillButton>
                <button
                  type="button"
                  onClick={() => setPicked(new Set(doc.actions.map((_, i) => i)))}
                  className="text-caption text-action"
                >
                  전체 선택
                </button>
              </div>
              {push.isError && (
                <p className="text-caption text-alert mt-2">{(push.error as Error).message}</p>
              )}
            </div>
          )}

          {meeting.my_notes && (
            <div>
              <p className="text-caption text-ink-soft mb-1.5">회의 중 내 메모</p>
              <p className="text-body text-ink-soft whitespace-pre-wrap leading-relaxed bg-parchment rounded-md p-3">
                {meeting.my_notes}
              </p>
            </div>
          )}

          <details>
            <summary className="text-caption text-ink-mute cursor-pointer">
              요약 (목록에 표시되는 내용)
            </summary>
            <div className="space-y-3 mt-2">
              <Field label="안건 요약">
                <TextArea rows={2} value={agenda} onChange={(e) => setAgenda(e.target.value)} />
              </Field>
              <Field label="결정 요약">
                <TextArea
                  rows={2}
                  value={decisions}
                  onChange={(e) => setDecisions(e.target.value)}
                />
              </Field>
            </div>
          </details>
        </div>
      ) : (
        <div>
          <p className="text-caption text-ink-mute mb-1.5 leading-relaxed">
            자동 변환된 <strong className="font-semibold">전사문</strong>(음성을 문자로 옮긴 글)입니다.{' '}
            <strong className="font-semibold">인명·사내 용어의 오인식이 잦습니다.</strong> 이곳에서
            수정한 뒤 초안을 작성하면 정확도가 크게 올라갑니다.
          </p>
          <TextArea
            rows={16}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            className="text-caption leading-relaxed"
          />
        </div>
      )}

      {/* ── 버튼 줄 ──────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <PillButton type="button" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? '저장하는 중…' : dirty ? '저장' : '저장됨'}
        </PillButton>

        {transcript.trim() && (
          <PillButton
            type="button"
            variant="ghost"
            disabled={ask.isPending}
            onClick={() => ask.mutate()}
          >
            {ask.isPending
              ? part && part.of > 1
                ? `정리하는 중… ${part.at}/${part.of} 구간`
                : '정리하는 중…'
              : meeting.ai_draft
                ? 'AI 초안 다시 만들기'
                : 'AI 회의록 초안 만들기'}
          </PillButton>
        )}

        <PillButton
          type="button"
          variant="ghost"
          onClick={() => {
            void navigator.clipboard?.writeText(readable())
            setCopied(true)
          }}
        >
          {copied ? '복사했습니다' : '복사'}
        </PillButton>

        <PillButton
          type="button"
          variant="ghost"
          onClick={() => downloadText(readable(), `${meeting.met_on}_${meeting.title}_회의록`)}
        >
          파일(.md)
        </PillButton>

        <PillButton
          type="button"
          variant="ghost"
          onClick={() => {
            const ok = printMinutes(doc, {
              title: meeting.title,
              metOn: meeting.met_on,
              place: meeting.place,
              attendees: meeting.attendees,
              durationSec: meeting.duration_sec,
              // ⚠️ 작성자는 인쇄 양식에 칸이 있는데도 **넘기지 않고 있었다**(2026-08-18).
              //    칸을 만들고 값을 안 넘기면 화면에선 그냥 「없는 칸」으로 보인다
              writer: meeting.writer,
              startedAt: meeting.started_at,
              endedAt: meeting.ended_at,
            })
            setNote(
              ok
                ? '인쇄 창에서 「대상」을 「PDF로 저장」으로 선택하시면 PDF로 저장됩니다.'
                : '팝업이 차단되어 있습니다. 주소창 오른쪽에서 팝업을 허용해 주세요.',
            )
          }}
        >
          PDF
        </PillButton>

        {confirmDrop ? (
          <>
            <PillButton
              type="button"
              variant="ghost"
              className="text-alert"
              disabled={dropMeeting.isPending}
              onClick={() => dropMeeting.mutate()}
            >
              {dropMeeting.isPending ? '지우는 중…' : '정말 지웁니다'}
            </PillButton>
            <PillButton type="button" variant="ghost" onClick={() => setConfirmDrop(false)}>
              취소
            </PillButton>
            <span className="text-caption text-ink-mute">
              전사문과 보관 중인 음성이 함께 삭제됩니다.
            </span>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDrop(true)}
            className="text-caption text-ink-mute hover:text-alert ml-auto"
          >
            회의록 삭제
          </button>
        )}
      </div>

      {note && <p className="text-caption text-ink-soft">{note}</p>}
      {ask.isError && <p className="text-caption text-alert">{(ask.error as Error).message}</p>}
      {save.isError && <p className="text-caption text-alert">{(save.error as Error).message}</p>}
    </div>
  )
}

/**
 * 한 번에 AI 에게 넘기는 글자 수.
 * 넉넉할수록 회의 흐름을 잘 읽지만, 너무 길면 앞뒤가 묽어진다. 15,000자 ≈ 45분 분량.
 */
const PART_CHARS = 15_000

/** Action Item 한 줄을 인박스에 넣을 문장으로 */
function actionLine(a: ActionItem): string {
  return [a.text, a.owner && `담당 ${a.owner}`, a.due && `기한 ${a.due}`].filter(Boolean).join(' · ')
}

/**
 * 회의록을 파일로 내려받는다.
 *
 * 메일·결재·보고에 그대로 쓰려면 화면 밖으로 꺼낼 길이 있어야 한다.
 * 마크다운(.md)으로 주는 이유 — 표와 제목이 살아 있고, 워드·노션에 붙이면 서식이 따라간다.
 */
function downloadText(text: string, name: string) {
  const blob = new Blob([`﻿${text}`], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name.replace(/[\\/:*?"<>|]/g, '_')}.md`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** 소리를 내려받는다. 보관함이 비공개라 서버에서 한 번 가져와야 한다 */
async function downloadAudio(row: MeetingAudio) {
  const blob = await fetchMeetingAudio(row.path)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = row.path.split('/').pop() ?? 'meeting-audio'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** 어느 길로 받아쓴 회의록인가 */
function sourceLabel(source: string | null): string {
  if (source === '실시간받아쓰기') return '⚡ 브라우저 받아쓰기'
  if (source === '녹음전사') return '🎧 녹음 받아쓰기'
  return '✍ 직접 입력'
}

/** 저장된 양식을 읽는다. 칸이 없거나 깨져 있어도 화면이 죽지 않게 방어한다 */
function asDoc(raw: unknown): MinutesDoc {
  if (typeof raw !== 'object' || raw === null) return EMPTY_MINUTES
  const r = raw as Record<string, unknown>
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
  const next = (r.next ?? {}) as { date?: unknown; agenda?: unknown }
  return {
    purpose: arr<string>(r.purpose),
    agenda: arr<string>(r.agenda),
    discussions: arr(r.discussions),
    decisions: arr(r.decisions),
    actions: arr(r.actions),
    pending: arr<string>(r.pending),
    next: {
      date: typeof next.date === 'string' ? next.date : '',
      agenda: typeof next.agenda === 'string' ? next.agenda : '',
    },
    checks: arr<string>(r.checks),
  }
}
