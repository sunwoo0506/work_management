import { useState } from 'react'
import { Field, PillButton, Select, TextArea, TextInput } from '../../components/Field'
import {
  AREAS, PRIORITIES, REQUESTED_SOURCES, TASK_SOURCES, TASK_STATUSES,
} from '../../domain/types'
import type { TaskSource } from '../../domain/types'
import { useDirectives } from '../directives/hooks'
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
  const [v, setV] = useState<TaskFormValues>({
    title: initial?.title ?? '',
    detail: initial?.detail ?? '',
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

  // 설계서 §4.2 — 요청받은 업무는 회신 내용을 적어야 닫힌다
  const blockedByReply =
    isRequested && v.status === '완료' && !String(v.reply_body ?? '').trim()

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (blockedByReply) return
        onSubmit({ ...v, area: v.area || null, detail: v.detail || null })
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

      <Field label="상세">
        <TextArea rows={4} value={v.detail ?? ''} onChange={(e) => set('detail', e.target.value)} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
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
        <Field label="중요도">
          <Select value={v.priority} onChange={(e) => set('priority', e.target.value)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
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

      <Field label="진행률" hint={`${v.progress ?? 0}%`}>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={v.progress ?? 0}
          onChange={(e) => set('progress', Number(e.target.value))}
          className="w-full accent-[#0066cc]"
        />
      </Field>

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
          <div className="grid grid-cols-2 gap-4">
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
          <Field label="회신 내용" hint="이걸 적어야 「완료」로 닫을 수 있습니다">
            <TextArea
              rows={3}
              value={v.reply_body ?? ''}
              onChange={(e) => set('reply_body', e.target.value)}
            />
          </Field>
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
