import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Json } from '../../lib/database.types'
import { Card } from '../../components/ui'
import { PillButton, TextInput } from '../../components/Field'
import { useCompanyId } from '../companies/useCompany'
import PasswordCard from '../auth/PasswordCard'
import AiUsageCard from './AiUsageCard'

/**
 * 설정 — 업체별 키-값.
 *
 * 테이블을 따로 만들 만큼은 아닌 것들이 여기 모인다.
 *   areas    업무영역 목록 — 업무·리포트의 「영역」 선택지
 *   glossary 사내 용어집 — 3단계에서 AI 가 문서를 쓸 때 참고한다
 *
 * 용어집을 지금 만들어 두는 이유 — AI 를 붙일 때 만들면 늦다.
 * 그때 채우려면 6개월치를 한 번에 떠올려야 한다. 지금부터 쌓아 둔다.
 */
export default function SettingsPanel() {
  const companyId = useCompanyId()
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: ['settings', companyId],
    queryFn: async (): Promise<Record<string, unknown>> => {
      const { data, error } = await supabase
        .from('settings')
        .select('key, value')
        .eq('company_id', companyId as string)
      if (error) throw error
      return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))
    },
    enabled: !!companyId,
  })

  const save = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: unknown }) => {
      const { data: auth } = await supabase.auth.getUser()
      const userId = auth.user?.id
      if (!userId) throw new Error('로그인 정보를 읽지 못했습니다.')

      const { error } = await supabase.from('settings').upsert(
        {
          company_id: companyId as string,
          user_id: userId,
          key,
          value: value as Json,
        },
        { onConflict: 'company_id,key' },
      )
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })

  const areas = asStringList(data?.areas)
  const glossary = asGlossary(data?.glossary)

  return (
    <div className="space-y-5">
      <Card title="업무영역" count={areas.length}>
        <p className="text-caption text-ink-mute mb-3">
          업무를 나누는 큰 갈래입니다. 리포트가 이 기준으로 집계됩니다.
        </p>
        <ChipEditor
          items={areas}
          placeholder="예: 회계, 인사, 총무"
          onChange={(next) => save.mutate({ key: 'areas', value: next })}
        />
      </Card>

      <Card title="사내 용어집" count={glossary.length}>
        <p className="text-caption text-ink-mute mb-3">
          밖에서는 안 쓰는 우리 회사 말. <strong className="font-semibold">3단계에서 AI 가
          문서를 쓸 때 이걸 참고합니다.</strong> 그때 몰아서 채우려면 늦으니 지금부터 쌓아 둡니다.
        </p>
        <PairEditor
          items={glossary}
          onChange={(next) => save.mutate({ key: 'glossary', value: next })}
        />
      </Card>

      {/*
        AI 사용량도 회사별 설정이 아니라 **내 계정**의 것이다.
        고치는 칸(업무영역·용어집) 뒤, 보기만 하는 칸으로 둔다.
      */}
      <AiUsageCard />

      {/* 로그인 방법은 회사별 설정이 아니라 **내 계정**의 것이라 맨 아래에 둔다 */}
      <PasswordCard />
    </div>
  )
}

function ChipEditor({
  items,
  placeholder,
  onChange,
}: {
  items: string[]
  placeholder?: string
  onChange: (next: string[]) => void
}) {
  const [draft, setDraft] = useState('')

  return (
    <>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {items.map((it) => (
            <span
              key={it}
              className="text-caption bg-canvas border border-hairline rounded-full pl-3 pr-1.5 py-1 inline-flex items-center gap-1.5"
            >
              {it}
              <button
                type="button"
                onClick={() => onChange(items.filter((x) => x !== it))}
                className="text-ink-mute hover:text-alert px-1"
                aria-label={`${it} 삭제`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const v = draft.trim()
          if (!v || items.includes(v)) return
          onChange([...items, v])
          setDraft('')
        }}
      >
        <TextInput value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} />
        <PillButton type="submit" variant="ghost" className="shrink-0">
          추가
        </PillButton>
      </form>
    </>
  )
}

type Pair = { term: string; means: string }

function PairEditor({ items, onChange }: { items: Pair[]; onChange: (next: Pair[]) => void }) {
  const [term, setTerm] = useState('')
  const [means, setMeans] = useState('')

  return (
    <>
      {items.length > 0 && (
        <ul className="divide-y divide-divider mb-3">
          {items.map((p, i) => (
            <li key={`${p.term}-${i}`} className="py-2 flex items-start gap-3 group">
              <span className="text-body font-semibold w-32 shrink-0">{p.term}</span>
              <span className="text-body text-ink-soft flex-1">{p.means}</span>
              <button
                type="button"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="text-caption text-ink-mute opacity-0 group-hover:opacity-100 hover:text-alert shrink-0"
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const t = term.trim()
          const m = means.trim()
          if (!t || !m) return
          onChange([...items, { term: t, means: m }])
          setTerm('')
          setMeans('')
        }}
      >
        <TextInput
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="용어"
          className="w-40 shrink-0"
        />
        <TextInput value={means} onChange={(e) => setMeans(e.target.value)} placeholder="무슨 뜻인가" />
        <PillButton type="submit" variant="ghost" className="shrink-0">
          추가
        </PillButton>
      </form>
    </>
  )
}

/** jsonb 가 깨져 있어도 화면이 죽지 않게 방어한다 */
function asStringList(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
}

function asGlossary(raw: unknown): Pair[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((p) => {
    if (typeof p !== 'object' || p === null) return []
    const { term, means } = p as { term?: unknown; means?: unknown }
    return typeof term === 'string' && typeof means === 'string' ? [{ term, means }] : []
  })
}
