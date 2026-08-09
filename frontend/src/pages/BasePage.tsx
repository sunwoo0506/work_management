import DirectiveList from '../features/directives/DirectiveList'

export default function BasePage() {
  const today = new Date()

  return (
    <div className="max-w-[900px]">
      <h1 className="text-[28px] leading-[1.2] font-semibold">기준</h1>

      <section className="mt-6">
        <h2 className="text-tagline font-semibold">지시사항</h2>
        <p className="text-caption text-ink-mute mt-1">
          업무를 지시사항에 연결하면 여기에 진행률이 합산됩니다.
        </p>
        <div className="mt-3">
          <DirectiveList today={today} />
        </div>
      </section>

      <section className="mt-10 bg-parchment rounded-lg p-6 border border-hairline">
        <p className="text-body text-ink-soft">이 탭에 앞으로 들어올 것</p>
        <ul className="mt-3 space-y-1.5">
          {[
            '인수인계 · 연락처 — 7단계',
            '업체 관리 — 두 번째 업체가 생길 때',
            '설정 (업무영역 분류, 사내 용어집) — 7단계',
          ].map((i) => (
            <li key={i} className="text-body text-ink-soft flex gap-2">
              <span aria-hidden className="text-ink-mute">·</span>
              {i}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
