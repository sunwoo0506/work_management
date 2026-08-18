import { AREAS } from './types'

/**
 * 업무영역 선택지를 만든다 — **선택지를 만드는 곳은 여기 한 곳뿐이다.**
 *
 * 원본은 「기준 › 설정 › 업무영역」이다. 아직 등록 전이면 코드에 둔
 * 기본 갈래(`AREAS`)로 버틴다 — 설정을 채우기 전에도 업무는 굴러가야 한다.
 *
 * `saved` 를 따로 받는 이유가 이 함수의 핵심이다.
 * 이미 저장된 값이 새 목록에 없을 수 있다(설정에서 영역 이름을 바꿨거나 지웠을 때).
 * 그때 선택칸이 빈칸으로 보이면 **사람이 건드리지도 않았는데 값이 사라진다.**
 * 그래서 목록에 없어도 뒤에 붙여 둔다.
 *
 * @param custom 설정에 등록된 목록. 없거나 비어 있으면 기본 갈래를 쓴다
 * @param saved  지금 이 항목에 저장돼 있는 값
 */
export function areaOptions(
  custom: readonly string[] | null | undefined,
  saved?: string | null,
): string[] {
  const base = custom && custom.length > 0 ? custom : AREAS
  const out: string[] = []
  for (const a of base) {
    const v = a.trim()
    if (v && !out.includes(v)) out.push(v)
  }

  const keep = saved?.trim()
  if (keep && !out.includes(keep)) out.push(keep)
  return out
}

/**
 * 저장된 값이 지금 목록에 없는가 — 화면이 「목록에 없음」을 덧붙일지 판단한다.
 *
 * 조용히 붙여 두기만 하면 사람은 그 값이 아직 유효한 줄 안다.
 * 설정에서 지워진 영역이라는 걸 알려 줘야 고칠 기회가 생긴다.
 */
export function isRetiredArea(
  custom: readonly string[] | null | undefined,
  saved?: string | null,
): boolean {
  const keep = saved?.trim()
  if (!keep) return false
  const base = custom && custom.length > 0 ? custom : AREAS
  return !base.some((a) => a.trim() === keep)
}
