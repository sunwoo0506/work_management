import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Company } from '../companies/useCompany'
import { SEED_COMPANY, SEED_DIRECTIVES } from './seedData'

type State = { isPending: boolean; error: string | null }

/**
 * 업체가 하나도 없으면 기본 데이터를 만든다.
 *
 * 한 번만 돌아야 하므로 companies 조회가 끝나고 목록이 빈 경우에만 실행한다.
 * 만들고 나면 companies 쿼리를 무효화해서 화면이 이어진다.
 */
export function useEnsureSeed(companies: Company[] | undefined): State {
  const qc = useQueryClient()
  const [state, setState] = useState<State>({ isPending: false, error: null })
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (companies === undefined) return // 아직 조회 중
    if (companies.length > 0) return // 이미 있다
    if (done) return

    let cancelled = false
    setDone(true)
    setState({ isPending: true, error: null })

    void (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser()
        const userId = auth.user?.id
        if (!userId) throw new Error('로그인 정보를 읽지 못했습니다.')

        const { data: company, error: cErr } = await supabase
          .from('companies')
          .insert({ ...SEED_COMPANY, user_id: userId, sort_order: 0 })
          .select()
          .single()
        if (cErr) throw cErr

        const rows = SEED_DIRECTIVES.map((d, i) => ({
          ...d,
          company_id: company.id,
          user_id: userId,
          sort_order: i,
        }))
        const { error: dErr } = await supabase.from('directives').insert(rows)
        if (dErr) throw dErr

        await qc.invalidateQueries({ queryKey: ['companies'] })
        if (!cancelled) setState({ isPending: false, error: null })
      } catch (e) {
        if (!cancelled) {
          setState({ isPending: false, error: e instanceof Error ? e.message : String(e) })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [companies, done, qc])

  return state
}
