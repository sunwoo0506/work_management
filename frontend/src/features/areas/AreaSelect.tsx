import { Select } from '../../components/Field'
import { useAreaOptions } from './useAreaOptions'

/**
 * 영역 선택칸.
 *
 * **목록을 어디서 가져오는지는 이 안에서만 안다.** 쓰는 화면은 값과 바뀔 때 할 일만
 * 넘긴다. 예전에는 화면마다 `<option>` 을 직접 그려서, 목록의 출처가 화면마다
 * 달라진 것을 아무도 눈치채지 못했다.
 */
export function AreaSelect({
  value,
  onChange,
}: {
  value: string | null | undefined
  onChange: (next: string) => void
}) {
  const { options, retired } = useAreaOptions(value)

  return (
    <>
      <Select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {options.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </Select>
      {retired && (
        <p className="text-caption text-ink-mute mt-1.5">
          「{value}」는 <strong className="font-semibold">설정 목록에 없습니다.</strong> 값은
          그대로 두었습니다 — 기준 › 설정 › 업무영역에서 되살리거나, 여기서 다른 영역으로
          바꾸시면 됩니다.
        </p>
      )}
    </>
  )
}
