import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Row } from '../../lib/supabase'
import { Card, EmptyState } from '../../components/ui'
import { Field, PillButton, Select, TextArea, TextInput } from '../../components/Field'
import { useCompanyId } from '../companies/useCompany'

type Handover = Row<'handover'>

const STATUSES = ['미확인', '확인중', '완료'] as const

/**
 * 인수인계.
 *
 * 「물어볼 것」이 이 화면의 핵심이다.
 * 전임자에게 물어야 하는데 아직 못 물은 것이 여기 쌓인다 —
 * 이게 비어야 인수인계가 끝난 것이다.
 *
 * ⚠️ 상대는 역할로 적는다. 실명은 커밋되면 안 된다 (CLAUDE.md 보안 규칙).
 */
export default function HandoverList() {
  const companyId = useCompanyId()
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [showDone, setShowDone] = useState(false)

  const { data: list } = useQuery({
    queryKey: ['handover', companyId],
    queryFn: async (): Promise<Handover[]> => {
      const { data, error } = await supabase
        .from('handover')
        .select('*')
        .eq('company_id', companyId as string)
        .order('created_at')
      if (error) throw error
      return data
    },
    enabled: !!companyId,
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['handover'] })

  const create = useMutation({
    mutationFn: async (v: {
      category: string
      item: string
      counterpart: string
      to_ask: string
      due_date: string
    }) => {
      const { data: auth } = await supabase.auth.getUser()
      const userId = auth.user?.id
      if (!userId) throw new Error('로그인 정보를 읽지 못했습니다.')

      const { error } = await supabase.from('handover').insert({
        company_id: companyId as string,
        user_id: userId,
        category: v.category || null,
        item: v.item,
        counterpart: v.counterpart || null,
        to_ask: v.to_ask || null,
        due_date: v.due_date || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setAdding(false)
      void invalidate()
    },
  })

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('handover').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const open = (list ?? []).filter((h) => h.status !== '완료')
  const done = (list ?? []).filter((h) => h.status === '완료')
  const shown = showDone ? (list ?? []) : open

  return (
    <Card
      title="인수인계"
      count={open.length}
      action={
        <div className="flex items-center gap-3">
          {done.length > 0 && (
            <button
              type="button"
              onClick={() => setShowDone((s) => !s)}
              className="text-caption text-ink-mute hover:text-ink"
            >
              {showDone ? '완료 숨기기' : `완료 ${done.length}건 보기`}
            </button>
          )}
          {!adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="text-caption text-action font-semibold"
            >
              ＋ 항목
            </button>
          )}
        </div>
      }
    >
      <p className="text-caption text-ink-mute mb-3">
        「물어볼 것」이 비어야 인수인계가 끝난 겁니다. 상대는 <strong className="font-semibold">역할로</strong> 적어 주세요.
      </p>

      {adding && <NewForm onCancel={() => setAdding(false)} onSubmit={(v) => create.mutate(v)} />}

      {shown.length === 0 ? (
        !adding && <EmptyState message="아직 없습니다." />
      ) : (
        <ul className="divide-y divide-divider">
          {shown.map((h) => (
            <li key={h.id} className="py-3 flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className={`text-body ${h.status === '완료' ? 'text-ink-mute' : ''}`}>{h.item}</p>
                {h.to_ask && (
                  <p className="text-caption text-action mt-1 leading-relaxed">
                    물어볼 것 — {h.to_ask}
                  </p>
                )}
                <p className="text-caption text-ink-mute mt-1">
                  {h.category && <span className="mr-2">{h.category}</span>}
                  {h.counterpart && <span className="mr-2">{h.counterpart}</span>}
                  {h.due_date}
                </p>
              </div>
              <Select
                value={h.status}
                onChange={(e) => setStatus.mutate({ id: h.id, status: e.target.value })}
                className="w-[92px] shrink-0"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function NewForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void
  onSubmit: (v: {
    category: string
    item: string
    counterpart: string
    to_ask: string
    due_date: string
  }) => void
}) {
  const [v, setV] = useState({
    category: '',
    item: '',
    counterpart: '',
    to_ask: '',
    due_date: '',
  })
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) =>
    setV((p) => ({ ...p, [k]: e.target.value }))

  return (
    <form
      className="border border-hairline rounded-md p-4 mb-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!v.item.trim()) return
        onSubmit(v)
      }}
    >
      <Field label="항목">
        <TextInput value={v.item} onChange={set('item')} placeholder="무엇을 넘겨받아야 하나" />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="분류">
          <TextInput value={v.category} onChange={set('category')} />
        </Field>
        <Field label="상대" hint="역할로">
          <TextInput value={v.counterpart} onChange={set('counterpart')} placeholder="예: 전임 부장" />
        </Field>
        <Field label="기한">
          <TextInput type="date" value={v.due_date} onChange={set('due_date')} />
        </Field>
      </div>
      <Field label="물어볼 것">
        <TextArea rows={2} value={v.to_ask} onChange={set('to_ask')} />
      </Field>
      <div className="flex gap-2">
        <PillButton type="submit">추가</PillButton>
        <PillButton type="button" variant="ghost" onClick={onCancel}>
          취소
        </PillButton>
      </div>
    </form>
  )
}
