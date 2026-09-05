import { TRANSCRIBE_MODELS, findTranscribeModel } from './transcribeModels'

/**
 * 어느 모델로 받아쓸지 고르는 칸.
 *
 * ── 왜 녹음 화면에 두나 ─────────────────────────────────
 * 「설정」에 한 번 정해 두는 것이 아니라 **쓰기 직전에 눌러서 바꾸는 것**이
 * 이 기능의 목적이다. 같은 회의를 두 모델로 받아써 견주려면
 * 고르는 자리가 **일하는 자리 옆에** 있어야 한다.
 *
 * 고른 값은 기억해 두므로(transcribeModels.ts) 매번 다시 고를 필요는 없다.
 *
 * ── ⚠️ 설명 문구를 뺐다 (2026-09-05, 사용자 판단) ────────
 * 처음엔 모델마다 한 줄 설명을 달고, 숫자를 안 주는 모델에는 경고 문단까지
 * 붙였다. **회의 시작 직전에 보는 화면이 그 설명으로 꽉 찼다.**
 *
 * 남긴 것은 **요금 한 줄**뿐이다. 누를 때마다 돈이 달라지는 것은 이 자리에서만
 * 알 수 있고, 나머지는 **눌러 봐야 아는 게 아니라 읽어서 아는 것**이라
 * 운영 안내에 있으면 된다 (docs/plans/2026-08-10-operations.md).
 *
 * ⚠️ **뺀 내용이 사라진 것은 아니다.** 모델마다의 성격은
 * `transcribeModels.ts` 의 주석에, 실측 결과는 설계서 §5.8ⓑ 와 운영 안내에 있다.
 */
export function TranscribeModelPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string
  onChange: (id: string) => void
  disabled?: boolean
}) {
  const picked = findTranscribeModel(value)

  return (
    <div>
      <p className="text-caption text-ink-mute mb-1.5">받아쓰기 모델</p>
      <div className="flex flex-wrap gap-1.5">
        {TRANSCRIBE_MODELS.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(m.id)}
            className={[
              'text-caption rounded-full px-3 py-1.5 border',
              value === m.id
                ? 'text-action border-action font-semibold'
                : 'text-ink-mute border-hairline',
              disabled ? 'opacity-40' : '',
            ].join(' ')}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* 요금 한 줄만. 누를 때마다 달라지고, 이 자리에서만 알 수 있는 값이다 */}
      <p className="text-caption text-ink-mute mt-2">
        {picked ? (
          <>
            {picked.vendor} · <span className="tabular-nums">1분당 약 ${picked.perMinuteUsd}</span>
          </>
        ) : (
          <>설정된 모델: {value}</>
        )}
      </p>
    </div>
  )
}
