import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Row } from '../../lib/supabase'
import { Card, EmptyState } from '../../components/ui'
import { useCompanyId } from '../companies/useCompany'
import MeetingDetail from './MeetingDetail'

type Meeting = Row<'meetings'>

/**
 * 회의록 — 직접 쓰기.
 *
 * 회의 중에 듣게 하려면 옆의 「🎙 실시간」을 쓴다 (LiveMeeting.tsx).
 * 이 화면은 **지나간 회의를 나중에 적거나, 다른 도구로 전사한 글을 옮겨 담는 자리**다.
 *
 * 「민감」은 표시로만 남는다. 전사문을 버리던 예전 동작은 걷어냈다 —
 * 사용자 판단 (2026-08-16). 아래 저장 부분 주석 참고.
 */
export default function MeetingList() {
  const companyId = useCompanyId()
  const [openId, setOpenId] = useState<string | null>(null)

  const { data: list } = useQuery({
    queryKey: ['meetings', companyId],
    queryFn: async (): Promise<Meeting[]> => {
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('company_id', companyId as string)
        .order('met_on', { ascending: false })
        .limit(50)
      if (error) throw error
      return data
    },
    enabled: !!companyId,
  })

  return (
    <Card title="회의록" count={list?.length ?? 0}>
      <p className="text-caption text-ink-mute mb-3">
        지난 회의가 모두 여기 모입니다.{' '}
        <strong className="font-semibold">항목을 선택하면 수정 · 초안 작성 · 내려받기 · 삭제가 가능합니다.</strong>
      </p>

      {!list || list.length === 0 ? (
        <EmptyState
          message="아직 없습니다."
          hint="회의록은 「🎙 회의록 만들기」에서 등록합니다."
        />
      ) : (
        <ul className="divide-y divide-divider">
          {list.map((m) => {
            const open = openId === m.id
            return (
              <li key={m.id} className="py-3">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : m.id)}
                  className="w-full text-left flex items-baseline gap-3"
                >
                  <span className="text-caption text-ink-mute w-24 shrink-0">{m.met_on}</span>
                  <span className="text-body flex-1 min-w-0">{m.title}</span>
                  {/* 펼치지 않아도 「정리했나 안 했나」가 보여야 한다 */}
                  {m.transcript && (
                    <span className="text-caption text-ink-mute shrink-0" title="받아쓴 글 있음">
                      {m.transcript_source === '녹음전사' ? '🎧' : '⚡'}
                    </span>
                  )}
                  {!m.agenda && !m.decisions && (
                    <span className="text-caption text-action shrink-0">정리 전</span>
                  )}
                  {m.sensitive && (
                    <span className="text-caption text-alert shrink-0">민감</span>
                  )}
                </button>

                {/* 펼칠 때만 그린다 — 회의가 쌓이면 목록 전체가 무거워진다 */}
                {open && <MeetingDetail key={m.id} meeting={m} />}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
