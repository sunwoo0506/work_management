import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Row } from '../../lib/supabase'
import { Card, EmptyState } from '../../components/ui'
import { useCompanyId } from '../companies/useCompany'
import MeetingDetail from './MeetingDetail'
import { deleteMeeting } from './api'

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
/**
 * @param openFirst **열어 둔 채로 시작할** 회의 (2026-09-08).
 *
 * 녹음 파일을 올려 회의록을 만들면 그 회의를 **바로 펼쳐** 보여 준다.
 * 전에는 「지난 회의록에서 열어 보세요」라고만 하고 사용자가 찾아가야 했다.
 * 방금 만든 것을 찾아가게 하는 건 **방금 한 일의 결과를 다른 화면에 두는 것**이다.
 */
export default function MeetingList({ openFirst }: { openFirst?: string | null } = {}) {
  const companyId = useCompanyId()
  const [openId, setOpenId] = useState<string | null>(openFirst ?? null)

  /*
    올리기를 마치고 넘어온 직후에는 목록이 아직 안 왔을 수 있다.
    번호가 바뀌면 그때 연다 — 안 그러면 「만들었는데 안 펼쳐진다」가 된다.
  */
  useEffect(() => {
    if (openFirst) setOpenId(openFirst)
  }, [openFirst])

  /**
   * 골라서 한꺼번에 지우기 (2026-09-08).
   *
   * ── 왜 ────────────────────────────────────────────────
   * 받아쓰기가 몇 번 실패하면 **같은 제목의 빈 회의록이 여럿 쌓인다.**
   * 지우려면 하나씩 펼치고 → 삭제 누르고 → 확인하고를 반복해야 했다.
   * 일곱 개면 스물한 번이다.
   */
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const qc = useQueryClient()

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const dropPicked = useMutation({
    mutationFn: async () => {
      /*
        하나씩 지운다 — deleteMeeting 이 **보관함의 소리도 함께** 치운다.
        한 번에 지우면 소리 파일이 주인 없이 남는다.
      */
      for (const id of picked) await deleteMeeting(id)
      return picked.size
    },
    onSuccess: () => {
      setPicked(new Set())
      setConfirming(false)
      void qc.invalidateQueries({ queryKey: ['meetings'] })
      void qc.invalidateQueries({ queryKey: ['meeting-audio-all'] })
    },
  })

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
        <strong className="font-semibold">제목을 누르면 수정 · 초안 작성 · 내려받기</strong>가
        되고, <strong className="font-semibold">왼쪽 칸을 체크하면 한꺼번에 지울 수 있습니다.</strong>
      </p>

      {/*
        ★ 고른 것이 있을 때만 나타난다. 늘 떠 있으면 지우기 단추가 늘 손 닿는 곳에 있게 된다.
        확인 칸도 **테를 두른 빨간 칸**으로 — 되돌릴 수 없는 것은 다르게 생겨야 한다.
      */}
      {picked.size > 0 && (
        <div className="border border-alert rounded-md p-3 mb-3 space-y-2">
          <p className="text-body">
            <strong className="font-semibold">{picked.size}개</strong>를 골랐습니다.
            {confirming && (
              <span className="text-alert">
                {' '}
                전사문 · 회의록 · 보관 중인 음성이 함께 사라집니다. 되돌릴 수 없습니다.
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            {confirming ? (
              <>
                <button
                  type="button"
                  disabled={dropPicked.isPending}
                  onClick={() => dropPicked.mutate()}
                  className="text-caption rounded-full px-4 py-1.5 bg-alert text-parchment
                             font-semibold disabled:opacity-50"
                >
                  {dropPicked.isPending ? '지우는 중…' : `${picked.size}개 삭제`}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="text-caption rounded-full px-4 py-1.5 border border-hairline text-ink-soft"
                >
                  삭제취소
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="text-caption rounded-full px-4 py-1.5 border border-alert text-alert"
                >
                  고른 것 삭제
                </button>
                <button
                  type="button"
                  onClick={() => setPicked(new Set())}
                  className="text-caption text-ink-mute"
                >
                  선택 해제
                </button>
              </>
            )}
          </div>
          {dropPicked.isError && (
            <p className="text-caption text-alert">{(dropPicked.error as Error).message}</p>
          )}
        </div>
      )}

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
                <div className="flex items-baseline gap-3">
                  {/* 체크는 제목 누르기와 **따로** 동작해야 한다 — 고르려다 펼쳐지면 안 된다 */}
                  <input
                    type="checkbox"
                    checked={picked.has(m.id)}
                    onChange={() => toggle(m.id)}
                    aria-label={`${m.title} 선택`}
                    className="accent-action shrink-0 self-center"
                  />
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : m.id)}
                  className="flex-1 min-w-0 text-left flex items-baseline gap-3"
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
                </div>

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
