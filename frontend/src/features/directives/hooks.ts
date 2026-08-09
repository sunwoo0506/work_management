import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Row } from '../../lib/supabase'
import { useCompanyId } from '../companies/useCompany'

export type Directive = Row<'directives'>

export function useDirectives() {
  const companyId = useCompanyId()
  return useQuery({
    queryKey: ['directives', companyId],
    queryFn: async (): Promise<Directive[]> => {
      const { data, error } = await supabase
        .from('directives')
        .select('*')
        .eq('company_id', companyId as string)
        .order('sort_order')
      if (error) throw error
      return data
    },
    enabled: !!companyId,
  })
}
