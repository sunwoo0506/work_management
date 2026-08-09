import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCompanyId } from '../companies/useCompany'
import { insertSampleData, removeSampleData } from './sampleData'

/**
 * 화면을 눈으로 보기 위한 샘플 데이터 버튼.
 *
 * 실제로 쓰기 시작하면 「샘플 지우기」로 한 번에 지운다.
 * 지울 때 제목 표식으로 찾으므로 사용자가 만든 업무는 건드리지 않는다.
 */
export default function SampleDataButton({ has }: { has: boolean }) {
  const companyId = useCompanyId()
  const qc = useQueryClient()

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['tasks', companyId] })
    void qc.invalidateQueries({ queryKey: ['inbox', companyId] })
  }

  const add = useMutation({
    mutationFn: () => insertSampleData(companyId as string),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: () => removeSampleData(companyId as string),
    onSuccess: refresh,
  })

  const busy = add.isPending || remove.isPending
  const m = has ? remove : add

  return (
    <button
      type="button"
      disabled={busy || !companyId}
      onClick={() => m.mutate()}
      className="text-caption text-ink-mute bg-canvas border border-hairline rounded-full
                 px-3 py-1.5 hover:text-ink disabled:opacity-40"
    >
      {busy ? '처리 중…' : has ? '샘플 지우기' : '샘플 데이터 넣기'}
    </button>
  )
}
