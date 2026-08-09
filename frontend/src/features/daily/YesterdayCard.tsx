import { Card } from '../../components/ui'
import { buildYesterdayStory, hasStory } from '../../domain/daily'
import { useCompanyId } from '../companies/useCompany'
import { useYesterday } from './hooks'

/**
 * 「어제 이야기」.
 *
 * 일지를 "적고 끝나는 것"이 아니라 "다음날로 이어지는 것"으로 만드는 자리다.
 * 전날 적은 이슈, 전날 완료한 업무, 업무로 올리지 않아 메모로만 남은 것.
 */
export default function YesterdayCard({ today }: { today: Date }) {
  const companyId = useCompanyId()
  const { date, log, todos } = useYesterday(companyId, today)
  const story = buildYesterdayStory(log, todos)

  return (
    <Card title="어제 이야기">
      {!hasStory(story) ? (
        <p className="text-caption text-ink-mute py-1">
          {log
            ? `${date} 일지에 남긴 이야기가 없습니다.`
            : `${date} 일지를 쓰지 않았습니다. 「기록」 탭에서 오늘 일지를 열 수 있습니다.`}
        </p>
      ) : (
        <div className="space-y-4">
          {story.issues && (
            <div>
              <p className="text-caption text-ink-mute mb-1">막힌 것</p>
              <p className="text-body text-ink-soft whitespace-pre-wrap leading-relaxed">
                {story.issues}
              </p>
            </div>
          )}

          {story.finished.length > 0 && (
            <div>
              <p className="text-caption text-ink-mute mb-1">
                어제 끝낸 것 {story.finished.length}
              </p>
              <ul className="space-y-1">
                {story.finished.map((f) => (
                  <li key={f.taskId} className="text-body text-ink-soft flex gap-2">
                    <span aria-hidden className="text-ink-mute">·</span>
                    {f.title}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {story.keptAsMemo.length > 0 && (
            <div>
              <p className="text-caption text-ink-mute mb-1">
                메모로만 남긴 것 {story.keptAsMemo.length}
              </p>
              <ul className="space-y-1">
                {story.keptAsMemo.map((t) => (
                  <li key={t} className="text-body text-ink-mute flex gap-2">
                    <span aria-hidden>·</span>
                    {t}
                  </li>
                ))}
              </ul>
              <p className="text-caption text-ink-mute mt-1.5">
                「업무로」를 체크하지 않아 업무가 되지 않았습니다.
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
