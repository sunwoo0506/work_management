import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Row } from '../../lib/supabase'
import { Card, EmptyState } from '../../components/ui'
import { Field, PillButton, Select, TextArea, TextInput } from '../../components/Field'
import { useCompanyId } from '../companies/useCompany'

type Call = Row<'calls'>

/**
 * 전화메모.
 *
 * 통화는 끊기면 사라진다. 「조치」와 「처리했나」를 같이 두는 이유 —
 * 전화로 받은 요청이 업무로 안 넘어가서 잊히는 것이 실제로 잦다.
 *
 * ⚠️ 상대는 역할로 적는다 (CLAUDE.md 보안 규칙).
 */
export default function CallList() {
  const companyId = useCompanyId()
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)

  const { data: list } = useQuery({
    queryKey: ['calls', companyId],
    queryFn: async (): Promise<Call[]> => {
      const { data, error } = await supabase
        .from('calls')
        .select('*')
        .eq('company_id', companyId as string)
        .order('called_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data
    },
    enabled: !!companyId,
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['calls'] })

  const create = useMutation({
    mutationFn: async (v: CallDraft) => {
      const { data: auth } = await supabase.auth.getUser()
      const userId = auth.user?.id
      if (!userId) throw new Error('로그인 정보를 읽지 못했습니다.')

      const { error } = await supabase.from('calls').insert({
        company_id: companyId as string,
        user_id: userId,
        counterpart: v.counterpart || null,
        org: v.org || null,
        phone: v.phone || null,
        direction: v.direction,
        content: v.content,
        action: v.action || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setAdding(false)
      void invalidate()
    },
  })

  const toggle = useMutation({
    mutationFn: async ({ id, handled }: { id: string; handled: boolean }) => {
      const { error } = await supabase.from('calls').update({ handled }).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const pending = (list ?? []).filter((c) => !c.handled).length

  return (
    <Card
      title="전화메모"
      count={pending}
      action={
        !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-caption text-action font-semibold"
          >
            ＋ 전화메모
          </button>
        )
      }
    >
      <p className="text-caption text-ink-mute mb-3">
        옆 숫자는 <strong className="font-semibold">아직 처리 안 한 건</strong>입니다. 전화로 받은
        요청이 업무로 안 넘어가서 잊히는 일을 막습니다.
      </p>

      {adding && <NewForm onCancel={() => setAdding(false)} onSubmit={(v) => create.mutate(v)} />}

      {!list || list.length === 0 ? (
        !adding && <EmptyState message="아직 없습니다." />
      ) : (
        <ul className="divide-y divide-divider">
          {list.map((c) => (
            <li key={c.id} className="py-3 flex items-start gap-3">
              <input
                type="checkbox"
                checked={c.handled}
                onChange={() => toggle.mutate({ id: c.id, handled: !c.handled })}
                className="mt-1.5 accent-action shrink-0"
                aria-label="처리함"
              />
              <div className="min-w-0 flex-1">
                <p className="text-caption text-ink-mute">
                  {c.called_at.slice(0, 16).replace('T', ' ')}
                  <span className="ml-2">{c.direction}</span>
                  {c.counterpart && <span className="ml-2">{c.counterpart}</span>}
                  {c.org && <span className="ml-1">({c.org})</span>}
                </p>
                <p className={`text-body mt-0.5 ${c.handled ? 'text-ink-mute' : ''}`}>{c.content}</p>
                {c.action && (
                  <p className="text-caption text-action mt-1">조치 — {c.action}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

type CallDraft = {
  counterpart: string
  org: string
  phone: string
  direction: '수신' | '발신'
  content: string
  action: string
}

function NewForm({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (v: CallDraft) => void }) {
  const [v, setV] = useState<CallDraft>({
    counterpart: '',
    org: '',
    phone: '',
    direction: '수신',
    content: '',
    action: '',
  })
  const set = (k: keyof CallDraft) => (e: { target: { value: string } }) =>
    setV((p) => ({ ...p, [k]: e.target.value }))

  return (
    <form
      className="border border-hairline rounded-md p-4 mb-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!v.content.trim()) return
        onSubmit(v)
      }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Field label="수신/발신">
          <Select value={v.direction} onChange={set('direction')}>
            <option value="수신">수신</option>
            <option value="발신">발신</option>
          </Select>
        </Field>
        <Field label="상대" hint="역할로">
          <TextInput value={v.counterpart} onChange={set('counterpart')} />
        </Field>
        <Field label="소속">
          <TextInput value={v.org} onChange={set('org')} />
        </Field>
        <Field label="번호">
          <TextInput value={v.phone} onChange={set('phone')} />
        </Field>
      </div>
      <Field label="내용">
        <TextArea rows={3} value={v.content} onChange={set('content')} />
      </Field>
      <Field label="조치" hint="무엇을 하기로 했나">
        <TextInput value={v.action} onChange={set('action')} />
      </Field>
      <div className="flex gap-2">
        <PillButton type="submit">저장</PillButton>
        <PillButton type="button" variant="ghost" onClick={onCancel}>
          취소
        </PillButton>
      </div>
    </form>
  )
}
