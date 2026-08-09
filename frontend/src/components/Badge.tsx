import type { Schedule } from '../domain/types'

/**
 * 배지.
 *
 * 색 규칙 — 경고색(#d70015)은 **기한 초과에만** 쓴다.
 * 다른 데 쓰기 시작하면 경고가 안 보인다 (설계서 §8.1).
 * 나머지는 잉크 계열 농도로만 구분한다.
 */
export function ScheduleBadge({ schedule, label }: { schedule: Schedule; label: string }) {
  const overdue = schedule === '지연'
  const dim = schedule === '완료' || schedule === '보류' || schedule === '기한없음'
  return (
    <span
      className={[
        'inline-block text-caption px-2 py-0.5 rounded-full whitespace-nowrap',
        overdue
          ? 'text-alert font-semibold'
          : dim
            ? 'text-ink-mute'
            : 'text-ink-soft',
      ].join(' ')}
    >
      {label}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span
      className={[
        'inline-block text-caption px-2 py-0.5 rounded-full border whitespace-nowrap',
        priority === 'P0'
          ? 'border-ink text-ink font-semibold'
          : 'border-hairline text-ink-mute',
      ].join(' ')}
    >
      {priority}
    </span>
  )
}

export function SourceBadge({ source }: { source: string }) {
  return (
    <span className="inline-block text-caption px-2 py-0.5 rounded-full bg-parchment text-ink-mute whitespace-nowrap">
      {source}
    </span>
  )
}
