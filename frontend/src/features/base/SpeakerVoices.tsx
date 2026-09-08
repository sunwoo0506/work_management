import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Json } from '../../lib/database.types'
import { Card } from '../../components/ui'
import { PillButton, TextInput } from '../../components/Field'
import { useCompanyId } from '../companies/useCompany'
import { deleteSpeakerVoice, uploadSpeakerVoice } from '../meetings/api'
import type { SpeakerVoice } from '../meetings/api'

/**
 * 목소리 등록 — **회의록에 「화자1」 대신 이름이 적히게 한다.**
 *
 * ── 왜 필요한가 (2026-09-08) ─────────────────────────────
 * 화자 구분을 켜면 「화자1: …」 「화자2: …」로 나뉜다. 읽기는 나아지지만
 * **누가 화자1인지는 아무도 모른다.** 그리고 30분이 넘어 소리를 잘라 보내면
 * **번호마저 구간마다 새로 매겨진다.**
 *
 * 목소리를 미리 등록해 두면 그 자리에 **이름이 그대로 들어간다.**
 * 이름은 구간마다 새로 매겨지지 않으므로 **잘려도 안 흔들린다.**
 *
 * 그러면 회의록의 **조치사항 담당**이 채워진다 — 「제가 하겠습니다」의
 * 「제가」가 누구인지 알 수 있게 되는 것이 이 기능의 진짜 목적이다.
 *
 * ── ⚠️ 되는 모델이 정해져 있다 ──────────────────────────
 * **OpenAI 의 「GPT 화자 구분」 모델만** 이름을 붙인다. 제미나이는 화자를
 * 가르기는 해도 번호로만 준다. 그래서 화면에 그 사실을 밝힌다 —
 * 등록해 놓고 이름이 안 나오면 「등록이 안 됐나」로 헤매게 된다.
 *
 * ── 목소리를 저장한다는 것 ───────────────────────────────
 * 사람 목소리는 민감한 자료다. 그래서 —
 *   · **본인만 볼 수 있는 자리**에 둔다 (경로 첫 칸이 내 아이디)
 *   · **실명을 파일 이름에 안 쓴다** — 경로에 이름이 남지 않게
 *   · 지우면 **소리도 같이 지운다**
 */
export default function SpeakerVoices() {
  const companyId = useCompanyId()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data } = useQuery({
    queryKey: ['settings', companyId],
    queryFn: async (): Promise<Record<string, unknown>> => {
      const { data, error } = await supabase
        .from('settings')
        .select('key, value')
        .eq('company_id', companyId as string)
      if (error) throw error
      return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))
    },
    enabled: !!companyId,
  })

  const list: SpeakerVoice[] = Array.isArray(data?.speakers)
    ? (data.speakers as SpeakerVoice[]).filter(
        (v) => v && typeof v.name === 'string' && typeof v.path === 'string',
      )
    : []

  const save = useMutation({
    mutationFn: async (next: SpeakerVoice[]) => {
      const { data: auth } = await supabase.auth.getUser()
      const userId = auth.user?.id
      if (!userId) throw new Error('로그인 정보를 읽지 못했습니다.')
      const { error } = await supabase.from('settings').upsert(
        {
          company_id: companyId as string,
          user_id: userId,
          key: 'speakers',
          value: next as unknown as Json,
        },
        { onConflict: 'company_id,key' },
      )
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })

  const add = useMutation({
    mutationFn: async (blob: Blob) => {
      const who = name.trim()
      if (!who) throw new Error('누구 목소리인지 먼저 적어 주세요.')
      if (list.some((v) => v.name === who)) throw new Error('같은 이름이 이미 있습니다.')
      const path = await uploadSpeakerVoice(blob)
      await save.mutateAsync([...list, { name: who, path }])
      return who
    },
    onSuccess: (who) => {
      setName('')
      setNote(`${who} 목소리를 등록했습니다.`)
    },
    onError: (e) => setNote(e instanceof Error ? e.message : String(e)),
  })

  const drop = useMutation({
    mutationFn: async (v: SpeakerVoice) => {
      // 소리도 같이 지운다 — 목록에서만 빼면 사람 목소리가 남는다
      await deleteSpeakerVoice(v.path).catch(() => {})
      await save.mutateAsync(list.filter((x) => x.path !== v.path))
    },
    onSuccess: () => setNote('지웠습니다.'),
  })

  /**
   * 5초만 녹음한다.
   *
   * 공급자가 받는 견본이 2~10초다. 길다고 좋아지지 않고, 길면 사람이
   * 「무슨 말을 해야 하지」 하고 망설인다. **5초로 못 박고 자동으로 멈춘다.**
   */
  const [recording, setRecording] = useState(false)
  async function record() {
    setNote(null)
    if (!name.trim()) {
      setNote('누구 목소리인지 먼저 적어 주세요.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      const parts: Blob[] = []
      rec.ondataavailable = (e) => e.data.size > 0 && parts.push(e.data)
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        setRecording(false)
        if (parts.length > 0) add.mutate(new Blob(parts, { type: parts[0].type }))
      }
      rec.start()
      setRecording(true)
      setTimeout(() => rec.state !== 'inactive' && rec.stop(), 5_000)
    } catch {
      setNote('마이크를 쓸 수 없습니다. 브라우저에서 마이크를 허용해 주세요.')
      setRecording(false)
    }
  }

  return (
    <Card title="목소리 등록" count={list.length}>
      <p className="text-caption text-ink-mute mb-3 leading-relaxed">
        회의록에 <strong className="font-semibold">「화자1」 대신 이름이 적힙니다.</strong>{' '}
        조치사항의 담당이 그대로 채워집니다 — 「제가 하겠습니다」의 「제가」가 누구인지
        알 수 있게 됩니다.
        <br />
        <strong className="font-semibold text-alert">
          받아쓰기 모델을 「GPT 화자 구분」으로 골랐을 때만 됩니다.
        </strong>{' '}
        제미나이는 화자를 가르기는 해도 번호로만 줍니다. 그리고{' '}
        <strong className="font-semibold">4명까지</strong>입니다.
      </p>

      {list.length > 0 && (
        <ul className="space-y-1.5 mb-3">
          {list.map((v) => (
            <li
              key={v.path}
              className="flex items-center gap-3 text-body border-b border-hairline pb-1.5"
            >
              <span className="flex-1">{v.name}</span>
              <button
                type="button"
                className="text-caption text-ink-mute hover:text-alert"
                onClick={() => drop.mutate(v)}
              >
                지우기
              </button>
            </li>
          ))}
        </ul>
      )}

      {list.length >= 4 ? (
        <p className="text-caption text-ink-mute">
          4명이 다 찼습니다. 더 넣으시려면 먼저 하나를 지워 주세요.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 대표이사 / 경영지원부장"
            className="flex-1 min-w-[180px]"
          />
          <PillButton type="button" onClick={record} disabled={recording || add.isPending}>
            {recording ? '녹음 중… 5초' : '🎙 5초 녹음'}
          </PillButton>
          <PillButton
            type="button"
            variant="ghost"
            disabled={add.isPending}
            onClick={() => fileRef.current?.click()}
          >
            파일로
          </PillButton>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) add.mutate(f)
              e.target.value = ''
            }}
          />
        </div>
      )}

      {note && <p className="text-caption text-ink-soft mt-2">{note}</p>}

      <p className="text-caption text-ink-mute mt-3">
        평소 말투로 5초쯤 말하시면 됩니다. 목소리는{' '}
        <strong className="font-semibold">본인만 볼 수 있는 자리</strong>에 저장되고,
        지우면 소리도 함께 지워집니다.
      </p>
    </Card>
  )
}
