import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Row } from '../../lib/supabase'
import { Card, EmptyState } from '../../components/ui'
import { Field, PillButton, TextArea, TextInput } from '../../components/Field'
import { ymd } from '../../domain/daily'
import { useCompanyId } from '../companies/useCompany'

type Meeting = Row<'meetings'>

/**
 * 회의록.
 *
 * 녹음 자동 전사는 아직 없다 (OQ-14) — 브라우저가 못 하는 일이라
 * 로컬에서 도는 별도 프로그램이 필요하다. 그때까지는 전사문을 붙여넣는다.
 *
 * ⚠️ 민감 회의(회생·인사)는 「민감」을 켜고 전사문을 넣지 않는다.
 *    설계서 §5.8 — 그런 내용은 Supabase 에도 저장하지 않는다.
 */
export default function MeetingList() {
  const companyId = useCompanyId()
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const { data: list } = useQuery({
    queryKey: ['meetings', companyId],
    queryFn: async (): Promise<Meeting[]> => {
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('company_id', companyId as string)
        .order('met_on', { ascending: false })
        .limit(50)
      if (error) throw error
      return data
    },
    enabled: !!companyId,
  })

  const create = useMutation({
    mutationFn: async (v: MeetingDraft) => {
      const { data: auth } = await supabase.auth.getUser()
      const userId = auth.user?.id
      if (!userId) throw new Error('로그인 정보를 읽지 못했습니다.')

      const { error } = await supabase.from('meetings').insert({
        company_id: companyId as string,
        user_id: userId,
        met_on: v.met_on,
        title: v.title,
        place: v.place || null,
        attendees: v.attendees || null,
        agenda: v.agenda || null,
        decisions: v.decisions || null,
        // 민감 회의는 전사문을 저장하지 않는다 (설계서 §5.8)
        transcript: v.sensitive ? null : v.transcript || null,
        sensitive: v.sensitive,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setAdding(false)
      void qc.invalidateQueries({ queryKey: ['meetings'] })
    },
  })

  return (
    <Card
      title="회의록"
      count={list?.length ?? 0}
      action={
        !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-caption text-action font-semibold"
          >
            ＋ 회의록
          </button>
        )
      }
    >
      <p className="text-caption text-ink-mute mb-3">
        녹음 자동 전사는 아직 없습니다. 전사문이 있으면 붙여넣어 주세요.
        <strong className="font-semibold"> 회생·인사 같은 민감한 회의는 「민감」을 켜 주세요</strong> —
        전사문이 저장되지 않습니다.
      </p>

      {adding && <NewForm onCancel={() => setAdding(false)} onSubmit={(v) => create.mutate(v)} />}

      {!list || list.length === 0 ? (
        !adding && <EmptyState message="아직 없습니다." />
      ) : (
        <ul className="divide-y divide-divider">
          {list.map((m) => {
            const open = openId === m.id
            return (
              <li key={m.id} className="py-3">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : m.id)}
                  className="w-full text-left flex items-baseline gap-3"
                >
                  <span className="text-caption text-ink-mute w-24 shrink-0">{m.met_on}</span>
                  <span className="text-body flex-1">{m.title}</span>
                  {m.sensitive && (
                    <span className="text-caption text-alert shrink-0">민감</span>
                  )}
                </button>

                {open && (
                  <dl className="mt-3 grid grid-cols-[80px_1fr] gap-y-2 text-body">
                    {m.place && (
                      <>
                        <dt className="text-caption text-ink-mute pt-0.5">장소</dt>
                        <dd>{m.place}</dd>
                      </>
                    )}
                    {m.attendees && (
                      <>
                        <dt className="text-caption text-ink-mute pt-0.5">참석</dt>
                        <dd>{m.attendees}</dd>
                      </>
                    )}
                    {m.agenda && (
                      <>
                        <dt className="text-caption text-ink-mute pt-0.5">안건</dt>
                        <dd className="whitespace-pre-wrap leading-relaxed">{m.agenda}</dd>
                      </>
                    )}
                    {m.decisions && (
                      <>
                        <dt className="text-caption text-ink-mute pt-0.5">결정</dt>
                        <dd className="whitespace-pre-wrap leading-relaxed">{m.decisions}</dd>
                      </>
                    )}
                    {m.transcript && (
                      <>
                        <dt className="text-caption text-ink-mute pt-0.5">전사문</dt>
                        <dd className="text-caption text-ink-soft whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                          {m.transcript}
                        </dd>
                      </>
                    )}
                  </dl>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

type MeetingDraft = {
  met_on: string
  title: string
  place: string
  attendees: string
  agenda: string
  decisions: string
  transcript: string
  sensitive: boolean
}

function NewForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void
  onSubmit: (v: MeetingDraft) => void
}) {
  const [v, setV] = useState<MeetingDraft>({
    met_on: ymd(new Date()),
    title: '',
    place: '',
    attendees: '',
    agenda: '',
    decisions: '',
    transcript: '',
    sensitive: false,
  })
  const set = (k: keyof MeetingDraft) => (e: { target: { value: string } }) =>
    setV((p) => ({ ...p, [k]: e.target.value }))

  return (
    <form
      className="border border-hairline rounded-md p-4 mb-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!v.title.trim()) return
        onSubmit(v)
      }}
    >
      <div className="grid grid-cols-[140px_1fr] gap-3">
        <Field label="일자">
          <TextInput type="date" value={v.met_on} onChange={set('met_on')} />
        </Field>
        <Field label="제목">
          <TextInput value={v.title} onChange={set('title')} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="장소">
          <TextInput value={v.place} onChange={set('place')} />
        </Field>
        <Field label="참석" hint="역할로 적습니다">
          <TextInput value={v.attendees} onChange={set('attendees')} placeholder="예: 대표, 구매사업본부 담당자" />
        </Field>
      </div>
      <Field label="안건">
        <TextArea rows={2} value={v.agenda} onChange={set('agenda')} />
      </Field>
      <Field label="결정사항">
        <TextArea rows={2} value={v.decisions} onChange={set('decisions')} />
      </Field>

      <label className="flex items-center gap-2 text-body">
        <input
          type="checkbox"
          checked={v.sensitive}
          onChange={(e) => setV((p) => ({ ...p, sensitive: e.target.checked }))}
          className="accent-action"
        />
        민감 회의 — 전사문을 저장하지 않습니다
      </label>

      {!v.sensitive && (
        <Field label="전사문" hint="있으면 붙여넣기. 없어도 됩니다">
          <TextArea rows={4} value={v.transcript} onChange={set('transcript')} />
        </Field>
      )}

      <div className="flex gap-2">
        <PillButton type="submit">저장</PillButton>
        <PillButton type="button" variant="ghost" onClick={onCancel}>
          취소
        </PillButton>
      </div>
    </form>
  )
}
