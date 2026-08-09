import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Row } from '../../lib/supabase'
import { Card, EmptyState } from '../../components/ui'
import { Field, PillButton, TextArea, TextInput } from '../../components/Field'
import { useCompanyId } from '../companies/useCompany'

type Contact = Row<'contacts'>

/**
 * 연락처.
 *
 * 「물어볼 것」이 붙어 있는 것이 보통 주소록과 다른 점이다.
 * 이 사람을 만나거나 전화할 때 같이 처리할 것을 미리 적어 둔다.
 *
 * ⚠️ 실명을 넣지 않는다. 역할·부서로 적는다 (CLAUDE.md 보안 규칙).
 *    이 저장소는 외부 서버에 올라간다.
 */
export default function ContactList() {
  const companyId = useCompanyId()
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)

  const { data: list } = useQuery({
    queryKey: ['contacts', companyId],
    queryFn: async (): Promise<Contact[]> => {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('company_id', companyId as string)
        .order('dept', { nullsFirst: false })
      if (error) throw error
      return data
    },
    enabled: !!companyId,
  })

  const create = useMutation({
    mutationFn: async (v: {
      name: string
      dept: string
      role: string
      phone: string
      email: string
      to_ask: string
    }) => {
      const { data: auth } = await supabase.auth.getUser()
      const userId = auth.user?.id
      if (!userId) throw new Error('로그인 정보를 읽지 못했습니다.')

      const { error } = await supabase.from('contacts').insert({
        company_id: companyId as string,
        user_id: userId,
        name: v.name,
        dept: v.dept || null,
        role: v.role || null,
        phone: v.phone || null,
        email: v.email || null,
        to_ask: v.to_ask || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setAdding(false)
      void qc.invalidateQueries({ queryKey: ['contacts'] })
    },
  })

  return (
    <Card
      title="연락처"
      count={list?.length ?? 0}
      action={
        !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-caption text-action font-semibold"
          >
            ＋ 연락처
          </button>
        )
      }
    >
      <p className="text-caption text-ink-mute mb-3">
        이름 대신 <strong className="font-semibold">역할</strong>로 적어 주세요. 이 데이터는 외부
        서버에 저장됩니다.
      </p>

      {adding && <NewForm onCancel={() => setAdding(false)} onSubmit={(v) => create.mutate(v)} />}

      {!list || list.length === 0 ? (
        !adding && <EmptyState message="아직 없습니다." />
      ) : (
        <ul className="divide-y divide-divider">
          {list.map((c) => (
            <li key={c.id} className="py-3">
              <div className="flex items-baseline gap-2">
                <p className="text-body font-semibold">{c.name}</p>
                <p className="text-caption text-ink-mute">
                  {[c.dept, c.role].filter(Boolean).join(' · ')}
                </p>
              </div>
              {(c.phone || c.email) && (
                <p className="text-caption text-ink-soft mt-0.5">
                  {[c.phone, c.email].filter(Boolean).join('  ')}
                </p>
              )}
              {c.to_ask && (
                <p className="text-caption text-action mt-1 leading-relaxed">물어볼 것 — {c.to_ask}</p>
              )}
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
    name: string
    dept: string
    role: string
    phone: string
    email: string
    to_ask: string
  }) => void
}) {
  const [v, setV] = useState({ name: '', dept: '', role: '', phone: '', email: '', to_ask: '' })
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
      <div className="grid grid-cols-3 gap-3">
        <Field label="표기" hint="역할로">
          <TextInput value={v.name} onChange={set('name')} placeholder="예: 구매사업본부 담당자" />
        </Field>
        <Field label="부서">
          <TextInput value={v.dept} onChange={set('dept')} />
        </Field>
        <Field label="역할">
          <TextInput value={v.role} onChange={set('role')} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="전화">
          <TextInput value={v.phone} onChange={set('phone')} />
        </Field>
        <Field label="메일">
          <TextInput value={v.email} onChange={set('email')} />
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
