import { useState } from 'react'
import { Field, PillButton, Select, TextArea, TextInput } from '../../components/Field'
import { GuideHint } from '../../components/GuideHint'
import { ProgressBar } from '../../components/ui'
import { checklistCount } from '../../domain/progress'
import { priorityLabel, priorityMeaning } from '../../domain/priority'
import {
  AREAS, PRIORITIES, REQUESTED_SOURCES, TASK_SOURCES, TASK_STATUSES,
} from '../../domain/types'
import type { TaskSource } from '../../domain/types'
import { useDirectives } from '../directives/hooks'
import { GUIDES } from './guides'
import { useChecklist } from './hooks'
import type { Task, TaskInsert } from './api'

export type TaskFormValues = Omit<TaskInsert, 'user_id' | 'company_id'>

/** 등록·수정 겸용. 출처에 따라 요청 관련 칸이 나타났다 사라진다. */
export default function TaskForm({
  initial,
  onSubmit,
  onCancel,
  busy,
}: {
  initial?: Task
  onSubmit: (v: TaskFormValues) => void
  onCancel: () => void
  busy?: boolean
}) {
  const { data: directives } = useDirectives()
  const { data: checklist } = useChecklist(initial?.id ?? null)
  const [v, setV] = useState<TaskFormValues>({
    title: initial?.title ?? '',
    detail: initial?.detail ?? '',
    notes: initial?.notes ?? '',
    source: initial?.source ?? '내 발의',
    area: initial?.area ?? '',
    priority: initial?.priority ?? 'P1',
    status: initial?.status ?? '할 일',
    start_date: initial?.start_date ?? null,
    due_date: initial?.due_date ?? null,
    progress: initial?.progress ?? 0,
    directive_id: initial?.directive_id ?? null,
    requester: initial?.requester ?? '',
    requester_dept: initial?.requester_dept ?? '',
    intake_channel: initial?.intake_channel ?? '',
    reply_due: initial?.reply_due ?? null,
    reply_body: initial?.reply_body ?? '',
  })

  const set = <K extends keyof TaskFormValues>(k: K, val: TaskFormValues[K]) =>
    setV((prev) => ({ ...prev, [k]: val }))

  const isRequested = REQUESTED_SOURCES.includes(v.source as TaskSource)
  const { done, total } = checklistCount(checklist ?? [])
  const byChecklist = total > 0

  // 설계서 §4.2 — 요청받은 업무는 회신 내용을 적어야 닫힌다
  const blockedByReply =
    isRequested && v.status === '완료' && !String(v.reply_body ?? '').trim()

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (blockedByReply) return
        onSubmit({
          ...v,
          area: v.area || null,
          detail: v.detail || null,
          notes: v.notes || null,
        })
      }}
      className="space-y-4"
    >
      <Field label="제목">
        <TextInput
          required
          autoFocus
          value={v.title}
          onChange={(e) => set('title', e.target.value)}
        />
      </Field>

      {/* 안내 문구는 guides.ts 한 곳에서 온다. 화면마다 따로 쓰면 문구끼리 어긋난다 */}
      <div>
        <span className="block text-caption text-ink-soft mb-1.5">상세</span>
        <GuideHint guide={GUIDES.detail} />
        <TextArea
          rows={4}
          value={v.detail ?? ''}
          onChange={(e) => set('detail', e.target.value)}
          placeholder={GUIDES.detail.placeholder}
          aria-label="상세"
          className="mt-2"
        />
      </div>

      <div>
        <span className="block text-caption text-ink-soft mb-1.5">작업 메모</span>
        <GuideHint guide={GUIDES.notes} />
        <TextArea
          rows={4}
          value={v.notes ?? ''}
          onChange={(e) => set('notes', e.target.value)}
          placeholder={GUIDES.notes.placeholder}
          aria-label="작업 메모"
          className="mt-2"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="출처">
          <Select value={v.source} onChange={(e) => set('source', e.target.value)}>
            {TASK_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="영역">
          <Select value={v.area ?? ''} onChange={(e) => set('area', e.target.value)}>
            <option value="">—</option>
            {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
          </Select>
        </Field>
        {/* 저장값은 그대로 P0·P1·P2 다. 고를 때만 사람 말로 보여 준다 */}
        <Field label="중요도" hint={priorityMeaning(v.priority ?? 'P1')}>
          <Select value={v.priority} onChange={(e) => set('priority', e.target.value)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{priorityLabel(p)}</option>
            ))}
          </Select>
        </Field>
        <Field label="상태">
          <Select value={v.status} onChange={(e) => set('status', e.target.value)}>
            {TASK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="시작일">
          <TextInput
            type="date"
            value={v.start_date ?? ''}
            onChange={(e) => set('start_date', e.target.value || null)}
          />
        </Field>
        <Field label="기한">
          <TextInput
            type="date"
            value={v.due_date ?? ''}
            onChange={(e) => set('due_date', e.target.value || null)}
          />
        </Field>
      </div>

      {/*
        진행률 — 체크리스트가 있으면 손을 못 대게 잠근다.
        둘 다 열어 두면 어느 쪽이 맞는지 알 수 없다.
        체크리스트가 없을 때만 사람이 정한다.
      */}
      {byChecklist ? (
        <Field
          label="진행률"
          hint="상세 화면에서 항목을 체크하면 이 막대가 따라 움직입니다"
        >
          {/* 개수는 체크리스트에서 직접 센다. 퍼센트를 거꾸로 나눠 복원하면 반올림에 어긋난다 */}
          <ProgressBar
            pct={v.progress ?? 0}
            label={`체크리스트 ${done} / ${total}`}
          />
        </Field>
      ) : (
        <Field label="진행률" hint="체크리스트를 만들면 그때부터 자동 계산됩니다">
          <ProgressBar pct={v.progress ?? 0} label="손으로 정한 값" />
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={v.progress ?? 0}
            onChange={(e) => set('progress', Number(e.target.value))}
            className="w-full accent-[#0066cc] mt-2"
            aria-label="진행률"
          />
        </Field>
      )}

      <Field label="지시사항 연결">
        <Select
          value={v.directive_id ?? ''}
          onChange={(e) => set('directive_id', e.target.value || null)}
        >
          <option value="">—</option>
          {(directives ?? []).map((d) => (
            <option key={d.id} value={d.id}>{d.code} · {d.title}</option>
          ))}
        </Select>
      </Field>

      {isRequested && (
        <fieldset className="bg-parchment rounded-lg p-4 border border-hairline space-y-4">
          <legend className="text-caption text-ink-mute px-1">요청 정보</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="요청자" hint="실명이 아니라 역할로 적습니다">
              <TextInput
                placeholder="예: 구매사업본부 담당자"
                value={v.requester ?? ''}
                onChange={(e) => set('requester', e.target.value)}
              />
            </Field>
            <Field label="부서">
              <TextInput
                value={v.requester_dept ?? ''}
                onChange={(e) => set('requester_dept', e.target.value)}
              />
            </Field>
            <Field label="접수 경로">
              <TextInput
                placeholder="예: 회의, 메일"
                value={v.intake_channel ?? ''}
                onChange={(e) => set('intake_channel', e.target.value)}
              />
            </Field>
            <Field label="회신 기한">
              <TextInput
                type="date"
                value={v.reply_due ?? ''}
                onChange={(e) => set('reply_due', e.target.value || null)}
              />
            </Field>
          </div>
          <div>
            <span className="block text-caption text-ink-soft mb-1.5">회신 내용</span>
            <GuideHint guide={GUIDES.reply} />
            <TextArea
              rows={3}
              value={v.reply_body ?? ''}
              onChange={(e) => set('reply_body', e.target.value)}
              placeholder={GUIDES.reply.placeholder}
              aria-label="회신 내용"
              className="mt-2"
            />
            <span className="block text-caption text-ink-mute mt-1">
              이걸 적어야 「완료」로 닫을 수 있습니다
            </span>
          </div>
        </fieldset>
      )}

      {blockedByReply && (
        <p className="text-caption text-alert" role="alert">
          요청받은 업무는 <strong className="font-semibold">회신 내용</strong>을 적어야 완료할 수 있습니다.
        </p>
      )}

      <div className="flex gap-2 pt-2">
        <PillButton type="submit" disabled={busy || blockedByReply}>
          {busy ? '저장 중…' : '저장'}
        </PillButton>
        <PillButton type="button" variant="ghost" onClick={onCancel}>
          취소
        </PillButton>
      </div>
    </form>
  )
}
