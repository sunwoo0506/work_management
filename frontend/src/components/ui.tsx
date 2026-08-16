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
    <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-6 pb-5 sm:pb-6 border-b border-hairline">
      <div className="min-w-0">
        <h1 className="text-title leading-[1.15] font-semibold tracking-[-0.5px]">{title}</h1>
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
        className={`text-metric leading-none font-semibold mt-2 tracking-[-0.5px] ${
          warn && value > 0 ? 'text-alert' : 'text-ink'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

/**
 * 진행률 막대.
 *
 * 숫자만 있으면 "67%"가 감이 안 온다. 막대가 있으면 눈으로 바로 읽힌다.
 * 반대로 **막대가 여러 개 겹치면** 어느 게 진짜인지 헷갈린다 —
 * 그래서 체크리스트 바로 위에는 안 둔다. 거기는 「3 / 5」 숫자로 충분하다.
 */
export function ProgressBar({
  pct,
  label,
}: {
  pct: number
  /** 막대 옆에 붙는 설명 (「체크리스트 3개 기준」 같은 것) */
  label?: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="text-body font-semibold tabular-nums">{pct}%</span>
        {label && <span className="text-caption text-ink-mute">{label}</span>}
      </div>
      <div
        className="mt-1.5 h-2 w-full bg-parchment rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-action rounded-full transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
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
