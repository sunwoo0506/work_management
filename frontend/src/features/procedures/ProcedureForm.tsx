import { useState } from 'react'
import { Field, PillButton, Select, TextArea, TextInput } from '../../components/Field'
import { AI_DELEGATIONS, PROCEDURE_STATUSES, TRIGGER_TYPES } from '../../domain/types'
import { describeTrigger } from '../../domain/trigger'
import type { TriggerRule, TriggerType } from '../../domain/trigger'
import { AreaSelect } from '../areas/AreaSelect'
import type { Procedure } from './api'

export type ProcedureValues = {
  code: string | null
  title: string
  area: string | null
  purpose: string | null
  trigger_type: string
  trigger_rule: TriggerRule
  ai_delegation: string
  status: string
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토']

export default function ProcedureForm({
  initial,
  onSubmit,
  onCancel,
  busy,
}: {
  initial?: Procedure
  onSubmit: (v: ProcedureValues) => void
  onCancel: () => void
  busy?: boolean
}) {
  const [v, setV] = useState<ProcedureValues>({
    code: initial?.code ?? '',
    title: initial?.title ?? '',
    area: initial?.area ?? '',
    purpose: initial?.purpose ?? '',
    trigger_type: initial?.trigger_type ?? '수동',
    trigger_rule: (initial?.trigger_rule ?? {}) as TriggerRule,
    ai_delegation: initial?.ai_delegation ?? '사람만',
    status: initial?.status ?? '초안',
  })

  const set = <K extends keyof ProcedureValues>(k: K, val: ProcedureValues[K]) =>
    setV((p) => ({ ...p, [k]: val }))
  const setRule = (patch: Partial<TriggerRule>) =>
    setV((p) => ({ ...p, trigger_rule: { ...p.trigger_rule, ...patch } }))

  const type = v.trigger_type as TriggerType

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({
          ...v,
          code: v.code || null,
          area: v.area || null,
          purpose: v.purpose || null,
        })
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-[110px_1fr] gap-4">
        <Field label="코드" hint="예: P-01">
          <TextInput value={v.code ?? ''} onChange={(e) => set('code', e.target.value)} />
        </Field>
        <Field label="제목">
          <TextInput
            required
            autoFocus
            placeholder="예: 부가세 신고"
            value={v.title}
            onChange={(e) => set('title', e.target.value)}
          />
        </Field>
      </div>

      <Field label="목적" hint="이 일을 왜 하는가. 나중에 AI가 읽습니다">
        <TextArea rows={2} value={v.purpose ?? ''} onChange={(e) => set('purpose', e.target.value)} />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="영역">
          <AreaSelect value={v.area} onChange={(next) => set('area', next)} />
        </Field>
        <Field label="상태" hint="확정해야 「절차 대기」에 뜹니다">
          <Select value={v.status} onChange={(e) => set('status', e.target.value)}>
            {PROCEDURE_STATUSES.filter((s) => s !== '폐기').map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        </Field>
      </div>

      <fieldset className="bg-parchment rounded-lg p-4 border border-hairline space-y-4">
        <legend className="text-caption text-ink-mute px-1">언제 시작하나</legend>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="트리거">
            <Select
              value={v.trigger_type}
              onChange={(e) => {
                set('trigger_type', e.target.value)
                set('trigger_rule', {}) // 종류가 바뀌면 규칙을 비운다
              }}
            >
              {TRIGGER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>

          {type === '주' && (
            <Field label="요일">
              <Select
                value={v.trigger_rule.weekday ?? ''}
                onChange={(e) => setRule({ weekday: Number(e.target.value) })}
              >
                <option value="">—</option>
                {WEEK.map((w, i) => <option key={w} value={i}>{w}요일</option>)}
              </Select>
            </Field>
          )}

          {(type === '월' || type === '연') && (
            <Field label="며칠" hint="그 달에 없으면 말일로 당깁니다">
              <TextInput
                type="number" min={1} max={31}
                value={v.trigger_rule.dayOfMonth ?? ''}
                onChange={(e) => setRule({ dayOfMonth: Number(e.target.value) })}
              />
            </Field>
          )}

          {type === '연' && (
            <Field label="몇 월">
              <TextInput
                type="number" min={1} max={12}
                value={v.trigger_rule.month ?? ''}
                onChange={(e) => setRule({ month: Number(e.target.value) })}
              />
            </Field>
          )}

          {type === '분기' && (
            <Field label="분기 종료 후 며칠">
              <TextInput
                type="number" min={0} max={90}
                value={v.trigger_rule.offsetDays ?? ''}
                onChange={(e) => setRule({ offsetDays: Number(e.target.value) })}
              />
            </Field>
          )}
        </div>

        <p className="text-caption text-ink-mute">
          → {describeTrigger({ type, rule: v.trigger_rule })}
          {(type === '이벤트' || type === '수동') && ' — 주기로 뜨지 않습니다'}
        </p>
      </fieldset>

      <Field
        label="AI 위임 수준"
        hint="3단계에서 AI를 붙일 때 이 스위치로 넘깁니다. 지금은 기록만 됩니다"
      >
        <Select value={v.ai_delegation} onChange={(e) => set('ai_delegation', e.target.value)}>
          {AI_DELEGATIONS.map((a) => <option key={a} value={a}>{a}</option>)}
        </Select>
      </Field>

      <div className="flex gap-2 pt-1">
        <PillButton type="submit" disabled={busy}>{busy ? '저장 중…' : '저장'}</PillButton>
        <PillButton type="button" variant="ghost" onClick={onCancel}>취소</PillButton>
      </div>
    </form>
  )
}
