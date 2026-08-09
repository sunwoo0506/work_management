/**
 * 본문 공통 조각.
 *
 * 디자인 규칙 (CLAUDE.md)
 *  · Action Blue #0066cc 가 유일한 인터랙티브 색. 두 번째 액센트를 만들지 않는다
 *  · 경고색 #d70015 은 기한 초과에만
 *  · 본문 17px, weight 는 300/400/600/700 만 (500 안 씀)
 *  · 카드 radius 18px, 버튼은 pill
 *  · 그림자를 넣지 않는다 — 밝은 면과 어두운 면의 교차가 구분선 역할을 한다
 */

export function PageHeader({
  title,
  description,
  right,
}: {
  title: string
  description?: string
  right?: React.ReactNode
}) {
  return (
    <header className="flex items-start justify-between gap-6 pb-6 border-b border-hairline">
      <div className="min-w-0">
        <h1 className="text-[30px] leading-[1.15] font-semibold tracking-[-0.5px]">{title}</h1>
        {description && (
          <p className="text-body text-ink-mute mt-1.5 leading-relaxed">{description}</p>
        )}
      </div>
      {right && <div className="shrink-0 flex items-center gap-2">{right}</div>}
    </header>
  )
}

export function Card({
  title,
  count,
  action,
  children,
  className = '',
}: {
  title?: string
  count?: number
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`bg-parchment rounded-lg border border-hairline ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
          <h2 className="text-body font-semibold">
            {title}
            {count !== undefined && (
              <span className="text-ink-mute font-normal ml-1.5">{count}</span>
            )}
          </h2>
          {action}
        </div>
      )}
      <div className={title ? 'px-5 pb-4' : 'p-5'}>{children}</div>
    </section>
  )
}

export function StatTile({
  label,
  value,
  warn = false,
}: {
  label: string
  value: number
  warn?: boolean
}) {
  return (
    <div className="bg-parchment rounded-lg border border-hairline px-5 py-4">
      <p className="text-caption text-ink-mute">{label}</p>
      <p
        className={`text-[28px] leading-none font-semibold mt-2 tracking-[-0.5px] ${
          warn && value > 0 ? 'text-alert' : 'text-ink'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

export function EmptyState({
  message,
  hint,
  action,
}: {
  message: string
  hint?: string
  action?: React.ReactNode
}) {
  return (
    <div className="py-10 text-center">
      <p className="text-body text-ink-mute">{message}</p>
      {hint && <p className="text-caption text-ink-mute mt-1.5">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** 아직 만들지 않은 것을 알리는 줄. 「언젠가」가 아니라 언제인지 적는다. */
export function LaterNote({
  stage,
  children,
}: {
  stage: number | string
  children: React.ReactNode
}) {
  return (
    <p className="text-caption text-ink-mute leading-relaxed">
      <span className="inline-block bg-canvas border border-hairline rounded-full px-2 py-0.5 mr-1.5 whitespace-nowrap">
        {typeof stage === 'number' ? `${stage}단계` : stage}
      </span>
      {children}
    </p>
  )
}
