import { useState } from 'react'
import { PillButton, Select, TextArea, TextInput } from '../../components/Field'
import { Card, EmptyState } from '../../components/ui'
import { PRIORITIES } from '../../domain/types'
import { ymd } from '../../domain/daily'
import type { LogSnapshotItem } from '../../domain/daily'
import { useCompanyId } from '../companies/useCompany'
import {
  useCloseLog, useDailyLog, useLogMutations, useLogTodos, useOpenTodayLog,
} from './hooks'

/**
 * 업무일지 4단 (설계서 §5.7).
 *
 * 1. 오늘 진행한 업무 — 자동 수집. 확정하면 굳는다
 * 2. 이슈·막힌 것    — 다음날 「어제 이야기」로
 * 3. 내일 할 일      — 체크한 것만 업무가 된다
 * 4. 메모
 */
export default function DailyLogPanel({ date }: { date: Date }) {
  const companyId = useCompanyId()
  const dateStr = ymd(date)
  const { data: log, isLoading } = useDailyLog(companyId, dateStr)
  const { data: todos } = useLogTodos(log?.id ?? null)
  const open = useOpenTodayLog()
  const m = useLogMutations(log ?? null)
  const close = useCloseLog()

  const [todoText, setTodoText] = useState('')
  const closed = !!log?.closed_at

  if (isLoading) return <p className="text-caption text-ink-mute">불러오는 중…</p>

  if (!log) {
    return (
      <Card>
        <EmptyState
          message={`${dateStr} 일지가 아직 없습니다.`}
          hint="하루를 닫으면서 무엇을 했고 내일 무엇을 할지 남깁니다."
          action={
            <PillButton
              type="button"
              disabled={open.isPending}
              onClick={() => open.mutate(dateStr)}
            >
              {open.isPending ? '만드는 중…' : '오늘 일지 열기'}
            </PillButton>
          }
        />
      </Card>
    )
  }

  const snapshot = Array.isArray(log.snapshot) ? (log.snapshot as LogSnapshotItem[]) : []

  return (
    <div className="space-y-5">
      {closed && (
        <p className="text-caption text-ink-mute bg-parchment border border-hairline
                      rounded-lg px-4 py-3">
          이 일지는 <strong className="font-semibold">굳었습니다</strong>.
          업무를 나중에 고쳐도 아래 「오늘 진행한 업무」는 변하지 않습니다.
        </p>
      )}

      {/* 1. 오늘 진행한 업무 */}
      <Card title="1. 오늘 진행한 업무" count={closed ? snapshot.length : undefined}>
        {!closed ? (
          <p className="text-caption text-ink-mute py-1">
            확정할 때 그날 상태가 바뀐 업무를 모아 굳힙니다. 직접 적지 않아도 됩니다.
          </p>
        ) : snapshot.length === 0 ? (
          <p className="text-caption text-ink-mute py-1">그날 갱신된 업무가 없었습니다.</p>
        ) : (
          <ul className="divide-y divide-divider -mx-1">
            {snapshot.map((s) => (
              <li key={s.taskId} className="py-2 px-1 flex items-center gap-3">
                <span className="text-body flex-1 truncate">{s.title}</span>
                {s.area && <span className="text-caption text-ink-mute">{s.area}</span>}
                <span className="text-caption text-ink-mute w-14 text-right">{s.status}</span>
                <span className="text-caption text-ink-mute w-10 text-right">{s.progress}%</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 2. 이슈·막힌 것 */}
      <Card title="2. 이슈 · 막힌 것">
        <p className="text-caption text-ink-mute mb-2">
          여기 적은 것이 <strong className="font-semibold">다음날 「어제 이야기」</strong>에 올라옵니다.
        </p>
        <TextArea
          rows={3}
          disabled={closed}
          placeholder="막힌 것, 물어볼 것, 기다리는 것"
          defaultValue={log.issues ?? ''}
          onBlur={(e) => !closed && m.update.mutate({ issues: e.target.value })}
        />
      </Card>

      {/* 3. 내일 할 일 */}
      <Card title="3. 내일 할 일" count={todos?.length ?? 0}>
        <p className="text-caption text-ink-mute mb-2">
          <strong className="font-semibold">체크한 것만</strong> 내일 기한의 업무가 됩니다.
          체크 안 한 것은 다음날 「어제 이야기」에 메모로 남습니다.
        </p>

        <ul className="divide-y divide-divider -mx-1">
          {(todos ?? []).map((t) => (
            <li key={t.id} className="py-2 px-1 flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={t.promote}
                disabled={closed}
                onChange={(e) =>
                  m.updateTodo.mutate({ id: t.id, patch: { promote: e.target.checked } })
                }
                className="accent-[#0066cc]"
                aria-label="업무로 올리기"
              />
              <span className="text-body flex-1">{t.title}</span>
              {t.promoted_task_id && (
                <span className="text-caption text-action">업무로 올림</span>
              )}
              {!closed && (
                <>
                  <Select
                    value={t.priority}
                    onChange={(e) =>
                      m.updateTodo.mutate({ id: t.id, patch: { priority: e.target.value } })
                    }
                    className="!w-auto !py-1 !px-2 text-caption"
                  >
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </Select>
                  <button
                    type="button"
                    onClick={() => m.removeTodo.mutate(t.id)}
                    className="text-caption text-ink-mute"
                  >
                    ×
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>

        {!closed && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const v = todoText.trim()
              if (!v) return
              m.addTodo.mutate(
                { title: v, sortOrder: todos?.length ?? 0 },
                { onSuccess: () => setTodoText('') },
              )
            }}
            className="mt-2.5"
          >
            <TextInput
              value={todoText}
              onChange={(e) => setTodoText(e.target.value)}
              placeholder="내일 할 일 추가 후 엔터"
              aria-label="내일 할 일 추가"
            />
          </form>
        )}
      </Card>

      {/* 4. 메모 */}
      <Card title="4. 메모">
        <TextArea
          rows={3}
          disabled={closed}
          defaultValue={log.memo ?? ''}
          onBlur={(e) => !closed && m.update.mutate({ memo: e.target.value })}
        />
      </Card>

      {!closed && (
        <div className="flex items-center gap-3">
          <PillButton
            type="button"
            disabled={close.isPending}
            onClick={() => close.mutate({ log, todos: todos ?? [], today: date })}
          >
            {close.isPending ? '확정 중…' : '일지 확정'}
          </PillButton>
          <p className="text-caption text-ink-mute">
            확정하면 「오늘 진행한 업무」가 굳고, 체크한 할 일이 업무가 됩니다.
          </p>
        </div>
      )}

      {close.isSuccess && (
        <p className="text-caption text-action">
          업무 {close.data.snapshotCount}건을 굳혔고, 할 일 {close.data.promoted}건을
          내일 업무로 올렸습니다.
        </p>
      )}
    </div>
  )
}
