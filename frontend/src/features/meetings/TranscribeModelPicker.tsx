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
 * whisper-1 말고는 **토막마다 「말이 맞나」 숫자를 안 준다.**
 *
 * 처음엔 이걸 「그러니 지어낸 말이 샌다」로 적었는데, **2026-09-05 에 재 보니
 * 반대였다** — 무음을 넣었을 때 지어낸 쪽은 whisper-1 이었고 나머지 둘은
 * 빈 글을 냈다. 숫자 그물이 필요했던 건 whisper-1 자신 때문이었다.
 *
 * 그래도 밝힌다. **시험은 한 번뿐이고 회의실은 다양하다.** 숫자가 없으면
 * 나중에 무슨 일이 생겨도 **잡을 그물이 낱말 목록뿐**인 것은 그대로다.
 * 겁주는 문구가 아니라 **무엇이 다른지**를 알려 주는 문구여야 한다.
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
          이 모델은 <strong className="font-semibold">토막마다 「말이 맞나」 숫자를 주지
          않습니다.</strong> 2026-09-05 시험에서는 조용한 구간에 <strong className="font-semibold">없는
          말을 지어내지 않았지만</strong>(그때 지어낸 쪽은 오히려 Whisper 였습니다),
          한 번 재 본 것뿐입니다. 회의 뒤 전사문을 한 번 훑어보시고, 없는 말이 보이면
          Whisper 로 되돌려 주세요.
        </p>
      )}
    </div>
  )
}
