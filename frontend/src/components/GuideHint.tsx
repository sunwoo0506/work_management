import { useState } from 'react'
import type { WriteGuide } from '../features/tasks/guides'

/**
 * 「이 칸엔 뭘 적나」 안내.
 *
 * 늘 펼쳐 두지 않는 이유 — 세 칸에 각각 네 줄씩 설명이 붙어 있으면
 * 정작 적을 자리가 안 보인다. 접어 두고 **한 줄 요약만** 늘 보인다.
 *
 * 대신 칸이 **비어 있으면 저절로 펼친다.** 처음 적는 사람에게는 설명이
 * 필요하고, 이미 적어 둔 사람에게는 방해다.
 */
export function GuideHint({ guide, openByDefault = false }: { guide: WriteGuide; openByDefault?: boolean }) {
  const [open, setOpen] = useState(openByDefault)

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-caption text-ink-mute hover:text-action text-left"
      >
        {guide.gist}
        <span className="text-action ml-1.5">{open ? '접기' : '뭘 적나?'}</span>
      </button>

      {open && (
        <div className="mt-2 bg-parchment border border-hairline rounded-md px-3.5 py-3">
          <p className="text-caption text-ink-mute">{guide.when}</p>
          <ul className="mt-2 space-y-1">
            {guide.items.map((it) => (
              <li key={it} className="text-caption text-ink-soft leading-relaxed">· {it}</li>
            ))}
          </ul>
          <p className="text-caption text-ink-mute mt-2.5 pt-2.5 border-t border-hairline leading-relaxed">
            {guide.elsewhere}
          </p>
        </div>
      )}
    </div>
  )
}
