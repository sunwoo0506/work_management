import { Card, PageHeader } from './ui'

/**
 * 아직 만들지 않은 화면의 자리표시자.
 *
 * "언젠가 만듭니다"가 아니라 **몇 단계에서 무엇이 들어오는지**를 적는다.
 * 몇 달 뒤에 이 화면을 열었을 때 "이거 왜 비어 있지"가 안 생기게 하려는 것이다.
 */
export default function Stage({
  stage,
  title,
  description,
  items,
}: {
  stage: number
  title: string
  description?: string
  items: { text: string; stage?: number }[]
}) {
  return (
    <div className="max-w-[1120px]">
      <PageHeader title={title} description={description} />

      <div className="grid grid-cols-[1fr_320px] gap-5 mt-6 items-start">
        <Card title={`${stage}단계에서 만듭니다`}>
          <ul className="space-y-3">
            {items.map((i) => (
              <li key={i.text} className="flex gap-2.5 items-baseline">
                <span
                  aria-hidden
                  className="text-caption text-ink-mute bg-canvas border border-hairline
                             rounded-full px-2 py-0.5 shrink-0 whitespace-nowrap"
                >
                  {i.stage ?? stage}단계
                </span>
                <span className="text-body text-ink-soft leading-relaxed">{i.text}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="지금 쓸 수 있는 것">
          <p className="text-body text-ink-soft leading-relaxed">
            1단계에서는 <strong className="font-semibold">「오늘」</strong>과{' '}
            <strong className="font-semibold">「업무」</strong>,{' '}
            <strong className="font-semibold">「기준」</strong>이 동작합니다.
          </p>
          <p className="text-caption text-ink-mute mt-3 leading-relaxed">
            인박스에 던져두고, 업무로 올리고, 칸반으로 옮기는 것까지 됩니다.
          </p>
        </Card>
      </div>
    </div>
  )
}
