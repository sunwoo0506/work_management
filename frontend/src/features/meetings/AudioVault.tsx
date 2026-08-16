import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card } from '../../components/ui'
import { PillButton } from '../../components/Field'
import { deleteAllMeetingAudio, listAllMeetingAudio } from './api'

/**
 * 보관된 소리를 한눈에 보고, 필요하면 **전부 지우는** 자리.
 *
 * ── 왜 필요한가 ──────────────────────────────────────────
 * ① **얼마나 쌓였는지 알 수 없었다.** 소리는 회의록 안에 흩어져 있어서
 *    "지금까지 서버에 뭐가 올라가 있나"를 볼 방법이 없었다.
 * ② **한 번에 지울 방법도 없었다.** 소리는 무겁고 사적이라
 *    "다 지우고 싶다"는 요구가 당연히 나온다. 실제로 나왔다 (2026-08-16).
 *
 * 회의록마다 하나씩 지우게 하면 열 번을 눌러야 한다. 여기서 한 번에 끝낸다.
 */
export default function AudioVault() {
  const qc = useQueryClient()
  const [confirm, setConfirm] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const { data: rows, isLoading } = useQuery({
    queryKey: ['meeting-audio-all'],
    queryFn: listAllMeetingAudio,
  })

  const wipe = useMutation({
    mutationFn: deleteAllMeetingAudio,
    onSuccess: (n) => {
      setConfirm(false)
      setDone(n === 0 ? '삭제할 음성이 없습니다.' : `음성 ${n}건을 삭제했습니다.`)
      void qc.invalidateQueries({ queryKey: ['meeting-audio-all'] })
      void qc.invalidateQueries({ queryKey: ['meeting-audio'] })
    },
  })

  const total = rows?.length ?? 0
  const mb = (rows ?? []).reduce((n, r) => n + (r.bytes ?? 0), 0) / 1024 / 1024

  return (
    <Card title="서버에 보관된 음성" count={total}>
      {isLoading ? (
        <p className="text-caption text-ink-mute">불러오는 중…</p>
      ) : total === 0 ? (
        <p className="text-body text-ink-soft leading-relaxed">
          보관 중인 음성이 <strong className="font-semibold">없습니다.</strong>
        </p>
      ) : (
        <>
          <p className="text-body text-ink-soft leading-relaxed">
            음성 {total}건 · 약 {Math.round(mb * 10) / 10}MB
          </p>
          <p className="text-caption text-ink-mute mt-1 leading-relaxed">
            변환하지 못한 회의 음성입니다. 각 회의록을 열면 해당 회의의 음성만 따로 관리할 수 있습니다.
          </p>
        </>
      )}

      <p className="text-caption text-ink-mute mt-3 leading-relaxed">
        음성은 <strong className="font-semibold">문자 변환이 완료되면 자동으로 삭제됩니다.</strong>
        회의록을 삭제할 때도 함께 삭제됩니다.
      </p>

      {done && <p className="text-caption text-ink-soft mt-3">{done}</p>}

      {total > 0 && (
        <div className="mt-3">
          {confirm ? (
            <div className="flex flex-wrap items-center gap-2">
              <PillButton
                type="button"
                variant="ghost"
                className="text-alert"
                disabled={wipe.isPending}
                onClick={() => wipe.mutate()}
              >
                {wipe.isPending ? '지우는 중…' : `${total}건 삭제`}
              </PillButton>
              <PillButton type="button" variant="ghost" onClick={() => setConfirm(false)}>
                취소
              </PillButton>
              <span className="text-caption text-ink-mute">삭제 후에는 복구할 수 없습니다.</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirm(true)}
              className="text-caption text-ink-mute hover:text-alert"
            >
              보관 중인 음성 전체 삭제
            </button>
          )}
        </div>
      )}

      {wipe.isError && (
        <p className="text-caption text-alert mt-2">{(wipe.error as Error).message}</p>
      )}
    </Card>
  )
}
