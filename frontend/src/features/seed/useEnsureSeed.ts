import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Company } from '../companies/useCompany'
import { SEED_COMPANY, SEED_DIRECTIVES } from './seedData'

type State = { isPending: boolean; error: string | null }

/**
 * 이 플래그가 컴포넌트 상태가 아니라 모듈 변수인 이유.
 *
 * 개발 모드의 StrictMode 는 컴포넌트를 두 번 마운트한다. 가드를 useState 로
 * 두면 재마운트 때 초기화되고, 두 마운트가 같은 "업체 없음" 결과를 보고
 * 각각 시드를 만든다. 실제로 그렇게 업체가 2건 생겼다 (52밀리초 간격).
 *
 * 모듈 변수는 재마운트에도 살아남는다. 새로고침하면 초기화되지만 그때는
 * 이미 업체가 있으므로 시드가 돌지 않는다.
 */
let seedStarted = false

/**
 * 업체가 하나도 없으면 기본 데이터를 만든다.
 *
 * 마이그레이션이 아니라 여기서 만드는 이유는 user_id 때문이다 —
 * SQL 에 특정 사용자 UUID 를 박으면 다른 환경에서 안 돌아간다.
 */
export function useEnsureSeed(companies: Company[] | undefined): State {
  const qc = useQueryClient()
  const [state, setState] = useState<State>({ isPending: false, error: null })

  useEffect(() => {
    if (companies === undefined) return // 아직 조회 중
    if (companies.length > 0) return // 이미 있다
    if (seedStarted) return

    seedStarted = true
    let cancelled = false
    setState({ isPending: true, error: null })

    void (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser()
        const userId = auth.user?.id
        if (!userId) throw new Error('로그인 정보를 읽지 못했습니다.')

        // 캐시가 아니라 DB 를 다시 본다. 플래그와 별개로 한 겹 더 막는다.
        const { count, error: cntErr } = await supabase
          .from('companies')
          .select('id', { count: 'exact', head: true })
        if (cntErr) throw cntErr
        if ((count ?? 0) > 0) {
          await qc.invalidateQueries({ queryKey: ['companies'] })
          if (!cancelled) setState({ isPending: false, error: null })
          return
        }

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
        seedStarted = false // 실패했으면 다시 시도할 수 있게 푼다
        if (!cancelled) {
          setState({ isPending: false, error: e instanceof Error ? e.message : String(e) })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [companies, qc])

  return state
}
