import { priorityLabel, priorityMeaning, priorityPips } from '../domain/priority'
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
 *
 * ── 왜 새 색을 안 만들었나 ──────────────────────────────
 * "너무 밋밋하다, 색이라도 넣어 달라"는 지적을 받았다. 그런데
 * 쓸 수 있는 색이 없다 — 파란색은 「누를 수 있는 것」, 빨간색은
 * 「기한 초과」로 이미 차 있다(CLAUDE.md). 중요도에 빨간색을 쓰면
 * 진짜 지연된 건이 묻힌다.
 *
 * 대신 세 가지를 겹쳤다 —
 *   ① 눈금(●●● / ●●○ / ●○○) — 채워진 칸 수가 곧 단계
 *   ② 채움 대비 — 최우선은 **검정 바탕에 흰 글자**. 목록에서 확 튄다
 *   ③ 명도 — 중요는 진한 회색 테두리, 보통은 흐리게
 *
 * 색상환을 늘리지 않고도 세 단계가 한눈에 갈린다.
 */
export function PriorityBadge({ priority }: { priority: string }) {
  const style =
    priority === 'P0'
      ? 'bg-ink text-white border-ink font-semibold'
      : priority === 'P1'
        ? 'bg-canvas text-ink-soft border-ink-mute'
        : 'bg-canvas text-ink-mute border-hairline'

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-caption px-2 py-0.5 rounded-full border whitespace-nowrap ${style}`}
      title={priorityMeaning(priority)}
    >
      <span className="text-[10px] leading-none tracking-[0.5px]">{priorityPips(priority)}</span>
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
