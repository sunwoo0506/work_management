import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Row } from '../../lib/supabase'
import { Card, EmptyState } from '../../components/ui'
import { Field, PillButton, Select, TextInput } from '../../components/Field'
import { useCompanyId } from '../companies/useCompany'

type EventRow = Row<'events'>

const KINDS = ['정기미팅', '마감', '기타'] as const

/**
 * 일정 — 시각이 정해진 약속.
 *
 * 절차의 「주기 트리거」와 헷갈리면 안 된다.
 *   절차 트리거 = 내가 해야 할 일이 돌아온 시점
 *   일정        = 시각이 정해진 약속. 내가 안 해도 그 시각에 일어난다
 *
 * 반복 규칙은 문장으로 적는다 (「매주 월 09:00」). 기계가 해석하지 않는다 —
 * 자동 생성까지 하려면 반복 규칙 엔진이 필요한데, 지금 필요한 것은
 * 「이번 주에 뭐가 있더라」를 잊지 않는 것뿐이다.
 */
export default function EventList() {
  const companyId = useCompanyId()
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)

  const { data: list } = useQuery({
    queryKey: ['events', companyId],
    queryFn: async (): Promise<EventRow[]> => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('company_id', companyId as string)
        .order('at')
      if (error) throw error
      return data
    },
    enabled: !!companyId,
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['events'] })

  const create = useMutation({
    mutationFn: async (v: { title: string; kind: string; at: string; repeat_rule: string }) => {
      const { data: auth } = await supabase.auth.getUser()
      const userId = auth.user?.id
      if (!userId) throw new Error('로그인 정보를 읽지 못했습니다.')

      const { error } = await supabase.from('events').insert({
        company_id: companyId as string,
        user_id: userId,
        title: v.title,
        kind: v.kind,
        // datetime-local 은 로컬 벽시계 문자열이다. Date 를 거쳐 저장해야
        // 시간대가 붙는다 — 문자열을 그대로 넣으면 UTC 로 해석된다.
        at: new Date(v.at).toISOString(),
        repeat_rule: v.repeat_rule || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setAdding(false)
      void invalidate()
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('events').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return (
    <Card
      title="일정"
      count={list?.length ?? 0}
      action={
        !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-caption text-action font-semibold"
          >
            ＋ 일정
          </button>
        )
      }
    >
      <p className="text-caption text-ink-mute mb-3">
        시각이 정해진 약속입니다. 절차의 주기와는 다릅니다 — 절차는 내가 해야 할 일이고, 일정은
        내가 안 해도 그 시각에 일어납니다.
      </p>

      {adding && <NewForm onCancel={() => setAdding(false)} onSubmit={(v) => create.mutate(v)} />}

      {!list || list.length === 0 ? (
        !adding && <EmptyState message="아직 없습니다." />
      ) : (
        <ul className="divide-y divide-divider">
          {list.map((e) => (
            <li key={e.id} className="py-3 flex items-baseline gap-3 group">
              <span className="text-caption text-ink-mute w-32 shrink-0">
                {e.at.slice(0, 16).replace('T', ' ')}
              </span>
              <span className="text-body flex-1">{e.title}</span>
              {e.repeat_rule && (
                <span className="text-caption text-ink-mute shrink-0">{e.repeat_rule}</span>
              )}
              <span className="text-caption text-ink-mute shrink-0">{e.kind}</span>
              <button
                type="button"
                onClick={() => remove.mutate(e.id)}
                className="text-caption text-ink-mute opacity-0 group-hover:opacity-100 hover:text-alert shrink-0"
              >
                삭제
              </button>
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
  onSubmit: (v: { title: string; kind: string; at: string; repeat_rule: string }) => void
}) {
  const [v, setV] = useState({ title: '', kind: '정기미팅', at: '', repeat_rule: '' })
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) =>
    setV((p) => ({ ...p, [k]: e.target.value }))

  return (
    <form
      className="border border-hairline rounded-md p-4 mb-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!v.title.trim() || !v.at) return
        onSubmit(v)
      }}
    >
      <Field label="제목">
        <TextInput value={v.title} onChange={set('title')} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="종류">
          <Select value={v.kind} onChange={set('kind')}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="시각">
          <TextInput type="datetime-local" value={v.at} onChange={set('at')} />
        </Field>
        <Field label="반복" hint="문장으로 — 예: 매주 월">
          <TextInput value={v.repeat_rule} onChange={set('repeat_rule')} />
        </Field>
      </div>
      <div className="flex gap-2">
        <PillButton type="submit">추가</PillButton>
        <PillButton type="button" variant="ghost" onClick={onCancel}>
          취소
        </PillButton>
      </div>
    </form>
  )
}
