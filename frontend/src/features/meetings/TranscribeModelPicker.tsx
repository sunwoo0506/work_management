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
 * ── ⚠️ 무엇을 반드시 밝히나 ──────────────────────────────
 * whisper-1 말고는 **토막마다 「말이 맞나」 숫자를 안 준다.** 그 숫자가
 * 「시청해주셔서 감사합니다」 같은 지어낸 말을 거르는 결정적 신호였다(2026-08-19).
 * 모르고 바꾸면 회의록에 없는 말이 들어와도 **왜 그런지 알 수 없다.**
 * 그래서 고른 순간 그 자리에서 알려 준다.
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

      <p className="text-caption text-ink-mute mt-2 leading-relaxed">
        {picked ? (
          <>
            {picked.vendor} · <span className="tabular-nums">1분당 약 ${picked.perMinuteUsd}</span>
            <span className="block mt-0.5">{picked.note}</span>
          </>
        ) : (
          <>설정된 모델: {value}</>
        )}
      </p>

      {/* 숫자를 안 주는 모델을 골랐을 때만. 늘 띄우면 아무도 안 읽는다 */}
      {picked && !picked.givesSpeechProb && (
        <p className="text-caption text-ink-soft mt-1.5 leading-relaxed">
          ⚠️ 이 모델은 <strong className="font-semibold">토막마다 「말이 맞나」 숫자를 주지
          않습니다.</strong> 「시청해주셔서 감사합니다」처럼 <strong className="font-semibold">회의에서
          아무도 하지 않은 말</strong>이 섞여 들어올 수 있습니다. 전사문을 한 번 훑어보시고,
          자주 그러면 Whisper 로 되돌리세요.
        </p>
      )}
    </div>
  )
}
