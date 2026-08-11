import { priorityLabel } from '../domain/priority'
import type { Schedule } from '../domain/types'

/**
 * 배지.
 *
 * 색 규칙 — 경고색(#d70015)은 **기한 초과에만** 쓴다.
 * 다른 데 쓰기 시작하면 경고가 안 보인다 (설계서 §8.1).
 * 나머지는 잉크 계열 농도로만 구분한다.
 */
export function ScheduleBadge({
  schedule,
  label,
  today = false,
}: {
  schedule: Schedule
  label: string
  /**
   * 오늘이 기한인가.
   *
   * 「임박」(7일 이내)과 같은 회색으로 묶으면 7일 남은 것과 오늘 끝낼 것이
   * 구분되지 않는다. 그렇다고 경고색을 쓰면 기한 초과가 안 보인다.
   * 그래서 색은 잉크 그대로 두고 **테두리와 굵기**로만 세운다.
   */
  today?: boolean
}) {
  const overdue = schedule === '지연'
  const dim = schedule === '완료' || schedule === '보류' || schedule === '기한없음'
  return (
    <span
      className={[
        'inline-block text-caption px-2 py-0.5 rounded-full whitespace-nowrap',
        overdue
          ? 'text-alert font-semibold'
          : today
            ? 'text-ink font-semibold border border-ink'
            : dim
              ? 'text-ink-mute'
              : 'text-ink-soft',
      ].join(' ')}
    >
      {label}
    </span>
  )
}

/**
 * 중요도.
 *
 * `P0` 이 아니라 「최우선」이라고 쓴다 — P0 를 보고 높은 건지 낮은 건지
 * 매번 생각해야 하면 배지가 제 일을 못 하는 것이다. 저장값은 그대로다.
 */
export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span
      className={[
        'inline-block text-caption px-2 py-0.5 rounded-full border whitespace-nowrap',
        priority === 'P0'
          ? 'border-ink text-ink font-semibold'
          : priority === 'P1'
            ? 'border-hairline text-ink-soft'
            : 'border-hairline text-ink-mute',
      ].join(' ')}
    >
      {priorityLabel(priority)}
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
