import { useEffect, useMemo, useState } from 'react'
import { CompanyContext, useCompanies } from './useCompany'
import { useEnsureSeed } from '../seed/useEnsureSeed'

/**
 * 지금 어느 업체를 보고 있는지를 앱 전체가 공유한다.
 *
 * 업체가 하나도 없으면 시드를 만든다(설계서 §12).
 * 시드를 마이그레이션이 아니라 여기서 만드는 이유는 user_id 때문이다 —
 * 마이그레이션에 특정 사용자 UUID를 박으면 다른 환경에서 안 돌아간다.
 */
export default function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { data: companies, isLoading } = useCompanies()
  const seed = useEnsureSeed(companies)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const list = useMemo(() => companies ?? [], [companies])

  // 선택된 업체가 없거나 목록에서 사라졌으면 첫 번째로 되돌린다
  useEffect(() => {
    if (list.length === 0) return
    if (!selectedId || !list.some((c) => c.id === selectedId)) {
      setSelectedId(list[0].id)
    }
  }, [list, selectedId])

  const value = useMemo(
    () => ({
      companies: list,
      company: list.find((c) => c.id === selectedId) ?? null,
      setCompanyId: setSelectedId,
      showSelector: list.length > 1,
    }),
    [list, selectedId],
  )

  if (isLoading || seed.isPending) {
    return (
      <div className="min-h-screen grid place-items-center bg-canvas">
        <p className="text-caption text-ink-mute">
          {seed.isPending ? '처음 사용하시는군요. 기본 데이터를 만드는 중…' : '불러오는 중…'}
        </p>
      </div>
    )
  }

  if (seed.error) {
    return (
      <div className="min-h-screen grid place-items-center bg-canvas px-6">
        <div className="max-w-[420px]">
          <p className="text-body font-semibold">기본 데이터를 만들지 못했습니다.</p>
          <p className="text-caption text-ink-mute mt-2">{String(seed.error)}</p>
        </div>
      </div>
    )
  }

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>
}
