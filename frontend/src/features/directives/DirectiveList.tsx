import { rollupByDirective } from '../../domain/rollup'
import { daysUntil, ddayLabel } from '../../domain/dday'
import { PriorityBadge } from '../../components/Badge'
import { useDirectives } from './hooks'
import { useTasks } from '../tasks/hooks'

/**
 * 지시사항별 진행 상황.
 *
 * 집계는 domain/rollup.ts 가 한다 — 시작일은 소속 업무의 최소 시작일,
 * 마감일은 최대 기한, 진행률은 평균. 화면에서 다시 계산하지 않는다.
 */
export default function DirectiveList({ today }: { today: Date }) {
  const { data: directives, isLoading } = useDirectives()
  const { data: tasks } = useTasks()

  if (isLoading) return <p className="text-caption text-ink-mute">불러오는 중…</p>
  if (!directives?.length) return <p className="text-body text-ink-mute">지시사항이 없습니다.</p>

  const rows = rollupByDirective(directives, tasks ?? [])

  return (
    <ul className="divide-y divide-divider">
      {rows.map((r) => {
        const d = daysUntil(r.dueDate, today)
        return (
          <li key={r.id} className="py-4 px-2">
            <div className="flex items-baseline gap-2">
              <span className="text-caption text-ink-mute font-semibold w-12 shrink-0">{r.code}</span>
              <span className="text-body flex-1">{r.title}</span>
              <PriorityBadge priority={directives.find((x) => x.id === r.id)?.priority ?? 'P1'} />
            </div>

            <div className="flex items-center gap-3 mt-2 pl-14">
              <div className="h-1.5 flex-1 bg-divider rounded-full overflow-hidden">
                <div className="h-full bg-action" style={{ width: `${r.progress}%` }} />
              </div>
              <span className="text-caption text-ink-mute w-10 text-right">{r.progress}%</span>
              <span className="text-caption text-ink-mute w-20 text-right">
                업무 {r.doneCount}/{r.totalCount}
              </span>
              <span className="text-caption text-ink-mute w-20 text-right">
                {r.totalCount > 0 ? ddayLabel(d) : '—'}
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
