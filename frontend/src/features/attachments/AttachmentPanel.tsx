import { useRef, useState } from 'react'
import { signedUrl } from './api'
import type { Attachment } from './api'
import { formatSize } from './extract'
import { useAttachments, useRemoveAttachment, useUploadAttachment } from './hooks'

/**
 * 업무에 붙는 파일.
 *
 * 올리는 순간 브라우저가 **글을 뽑아 둔다.** 그래야 AI 비서가 그 파일을 읽고
 * 체크리스트를 추리거나 질문에 답할 수 있다. 뽑기 실패는 실패대로 표시한다 —
 * 못 읽은 파일을 읽은 척하면 틀린 답이 근거 있는 답처럼 보인다.
 *
 * 파일 실물은 비공개 자리에 있고, 내려받을 때만 1분짜리 임시 주소를 만든다.
 */
export default function AttachmentPanel({ taskId }: { taskId: string }) {
  const { data: files } = useAttachments(taskId)
  const upload = useUploadAttachment(taskId)
  const remove = useRemoveAttachment(taskId)
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const list = files ?? []
  const readable = list.filter((f) => f.extract_status === '성공').length

  async function send(picked: FileList | null) {
    if (!picked) return
    for (const f of Array.from(picked)) {
      // 한 번에 여러 개를 올려도 차례대로 — 동시에 던지면 뽑기가 서로 느려진다
      await upload.mutateAsync(f).catch(() => undefined)
    }
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <section className="mt-7">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-caption text-ink-mute">첨부파일</h3>
        {list.length > 0 && (
          <span className="text-caption text-ink-mute">
            {list.length}개 중 {readable}개를 AI가 읽을 수 있습니다
          </span>
        )}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void send(e.dataTransfer.files)
        }}
        className={[
          'mt-2 rounded-md border border-dashed px-4 py-5 text-center',
          dragging ? 'border-action bg-parchment' : 'border-hairline',
        ].join(' ')}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          onChange={(e) => void send(e.target.files)}
          className="hidden"
          aria-label="파일 올리기"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
          className="text-body text-action font-semibold disabled:opacity-40"
        >
          {upload.isPending ? '올리는 중…' : '파일 고르기'}
        </button>
        <p className="text-caption text-ink-mute mt-1.5 leading-relaxed">
          여기로 끌어다 놓아도 됩니다 · 한 개 25MB 까지
          <br />
          <span className="text-ink-mute">
            글을 읽어 내는 형식 — PDF · docx · txt · csv · md
          </span>
        </p>
      </div>

      {upload.isError && (
        <p className="text-caption text-alert mt-2" role="alert">
          올리지 못했습니다 —{' '}
          {upload.error instanceof Error ? upload.error.message : String(upload.error)}
        </p>
      )}

      {list.length > 0 && (
        <ul className="mt-2 divide-y divide-divider">
          {list.map((f) => (
            <Row key={f.id} file={f} onRemove={() => remove.mutate(f)} busy={remove.isPending} />
          ))}
        </ul>
      )}
    </section>
  )
}

function Row({ file, onRemove, busy }: { file: Attachment; onRemove: () => void; busy: boolean }) {
  const [err, setErr] = useState<string | null>(null)

  async function open() {
    setErr(null)
    try {
      window.open(await signedUrl(file), '_blank', 'noopener')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <li className="group py-2.5">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => void open()}
          className="flex-1 min-w-0 text-left text-body truncate hover:text-action"
        >
          {file.name}
        </button>
        <span className="text-caption text-ink-mute shrink-0">{formatSize(file.size_bytes)}</span>
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          aria-label={`${file.name} 삭제`}
          className="shrink-0 text-caption text-ink-mute hover:text-alert px-1 opacity-0 group-hover:opacity-100 focus:opacity-100"
        >
          ×
        </button>
      </div>

      {/* 못 읽은 파일은 왜 못 읽었는지 그 자리에서 말해 준다.
          읽은 파일도 "앞부분만 읽었다" 같은 단서가 있으면 같이 보여 준다 */}
      {file.extract_note && (
        <p className="text-caption text-ink-mute mt-0.5 leading-relaxed">↳ {file.extract_note}</p>
      )}
      {err && (
        <p className="text-caption text-alert mt-0.5" role="alert">
          내려받지 못했습니다 — {err}
        </p>
      )}
    </li>
  )
}
