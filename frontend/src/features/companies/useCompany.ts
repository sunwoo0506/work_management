import { createContext, useContext } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Row } from '../../lib/supabase'

export type Company = Row<'companies'>

export function useCompanies() {
  return useQuery({
    queryKey: ['companies'],
    queryFn: async (): Promise<Company[]> => {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('active', true)
        .order('sort_order')
      if (error) throw error
      return data
    },
  })
}

type Ctx = {
  companies: Company[]
  company: Company | null
  setCompanyId: (id: string) => void
  /** 업체가 1개면 셀렉터를 숨긴다 (설계서 §5.9) */
  showSelector: boolean
}

export const CompanyContext = createContext<Ctx | null>(null)

export function useCompany(): Ctx {
  const ctx = useContext(CompanyContext)
  if (!ctx) throw new Error('CompanyContext 밖에서 useCompany를 불렀습니다.')
  return ctx
}

/** 업체가 정해지기 전에는 조회를 하지 않는다. company_id가 없으면 쿼리가 의미 없다. */
export function useCompanyId(): string | null {
  return useCompany().company?.id ?? null
}
