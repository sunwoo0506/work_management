import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Row } from '../../lib/supabase'
import { Card, EmptyState } from '../../components/ui'
import { Field, PillButton, Select, TextArea, TextInput } from '../../components/Field'
import { ddayLabel, daysUntil } from '../../domain/dday'
import { useCompanyId } from '../companies/useCompany'

type Milestone = Row<'milestones'>

const STATUSES = ['예정', '진행', '완료', '보류'] as const

/**
 * 마일스톤 — 지시사항보다 위에 있는 덩어리.
 *
 * 지시사항 하나로는 안 끝나는 것들이 있다.
 * 「완료조건」을 반드시 적게 하는 이유 — 그게 없으면 언제 끝난 건지
 * 아무도 모르고, 결국 영원히 「진행」에 남는다.
 */
export default function MilestoneList() {
  const companyId = useCompanyId()
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const today = new Date()

  const { data: list } = useQuery({
    queryKey: ['milestones', companyId],
    queryFn: async (): Promise<Milestone[]> => {
      const { data, error } = await supabase
        .from('milestones')
        .select('*')
        .eq('company_id', companyId as string)
        .order('target_date', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data
    },
    enabled: !!companyId,
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['milestones'] })

  const create = useMutation({
    mutationFn: async (v: {
      name: string
      category: string
      start_date: string
      target_date: string
      done_criteria: string
    }) => {
      const { data: auth } = await supabase.auth.getUser()
      const userId = auth.user?.id
      if (!userId) throw new Error('로그인 정보를 읽지 못했습니다.')

      const { error } = await supabase.from('milestones').insert({
        company_id: companyId as string,
        user_id: userId,
        name: v.name,
        category: v.category || null,
        start_date: v.start_date || null,
        target_date: v.target_date || null,
        done_criteria: v.done_criteria || null,
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
      const { error } = await supabase.from('milestones').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return (
    <div className="space-y-5">
      <Card
        title="마일스톤"
        count={list?.length ?? 0}
        action={
          !adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="text-caption text-action font-semibold"
            >
              ＋ 새 마일스톤
            </button>
          )
        }
      >
        <p className="text-caption text-ink-mute mb-3">
          지시사항 여러 개가 다 끝나야 도달하는 관문입니다.
          <strong className="font-semibold"> 완료조건을 적어 두세요.</strong> 그게 없으면 언제 끝난
          건지 알 수 없습니다.
        </p>

        {adding && <NewForm onCancel={() => setAdding(false)} onSubmit={(v) => create.mutate(v)} />}

        {!list || list.length === 0 ? (
          !adding && <EmptyState message="아직 없습니다." />
        ) : (
          <ul className="divide-y divide-divider">
            {list.map((m) => {
              const d = daysUntil(m.target_date, today)
              const late = m.status !== '완료' && d !== null && d < 0
              return (
                <li key={m.id} className="py-3 flex items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-body font-semibold">{m.name}</p>
                    {m.done_criteria && (
                      <p className="text-caption text-ink-mute mt-1 leading-relaxed">
                        끝나는 조건 — {m.done_criteria}
                      </p>
                    )}
                    <p className="text-caption text-ink-mute mt-1">
                      {m.category && <span className="mr-2">{m.category}</span>}
                      {m.start_date && <span className="mr-2">{m.start_date} ~</span>}
                      {m.target_date}
                    </p>
                  </div>

                  {m.target_date && m.status !== '완료' && (
                    <span
                      className={`text-caption shrink-0 pt-0.5 ${late ? 'text-alert' : 'text-ink-mute'}`}
                    >
                      {ddayLabel(d)}
                    </span>
                  )}

                  <Select
                    value={m.status}
                    onChange={(e) => setStatus.mutate({ id: m.id, status: e.target.value })}
                    className="w-[92px] shrink-0"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}

function NewForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void
  onSubmit: (v: {
    name: string
    category: string
    start_date: string
    target_date: string
    done_criteria: string
  }) => void
}) {
  const [v, setV] = useState({
    name: '',
    category: '',
    start_date: '',
    target_date: '',
    done_criteria: '',
  })
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) =>
    setV((p) => ({ ...p, [k]: e.target.value }))

  return (
    <form
      className="border border-hairline rounded-md p-4 mb-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!v.name.trim()) return
        onSubmit(v)
      }}
    >
      <Field label="이름">
        <TextInput value={v.name} onChange={set('name')} placeholder="예: 회생 절차 종결" />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="구분">
          <TextInput value={v.category} onChange={set('category')} />
        </Field>
        <Field label="시작일">
          <TextInput type="date" value={v.start_date} onChange={set('start_date')} />
        </Field>
        <Field label="목표일">
          <TextInput type="date" value={v.target_date} onChange={set('target_date')} />
        </Field>
      </div>
      <Field label="완료조건" hint="무엇이 되면 끝난 것인가">
        <TextArea rows={2} value={v.done_criteria} onChange={set('done_criteria')} />
      </Field>
      <div className="flex gap-2">
        <PillButton type="submit">만들기</PillButton>
        <PillButton type="button" variant="ghost" onClick={onCancel}>
          취소
        </PillButton>
      </div>
    </form>
  )
}
