/**
 * 아직 만들지 않은 화면의 자리표시자.
 *
 * "언젠가 만듭니다"가 아니라 **몇 단계에서 무엇이 들어오는지**를 적는다.
 * 몇 달 뒤에 이 화면을 열었을 때 "이거 왜 비어 있지"가 안 생기게 하려는 것이다.
 */
export default function Stage({
  stage,
  title,
  items,
}: {
  stage: number
  title: string
  items: string[]
}) {
  return (
    <div className="max-w-[640px]">
      <p className="text-caption text-ink-mute uppercase tracking-wide">{stage}단계</p>
      <h1 className="text-[28px] leading-[1.2] font-semibold mt-1">{title}</h1>
      <div className="mt-6 bg-parchment rounded-lg p-6 border border-hairline">
        <p className="text-body text-ink-soft">
          이 화면은 <strong className="font-semibold">{stage}단계</strong>에서 만듭니다.
          그때 들어올 것은 이렇습니다.
        </p>
        <ul className="mt-4 space-y-1.5">
          {items.map((i) => (
            <li key={i} className="text-body text-ink-soft flex gap-2">
              <span aria-hidden className="text-ink-mute">·</span>
              {i}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
