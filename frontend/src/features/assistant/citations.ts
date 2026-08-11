import type { WebSource } from './api'

/**
 * 답 안에 박힌 출처 링크를 **번호로 바꾼다.**
 *
 * ── 왜 ────────────────────────────────────────────────────
 * 클로니가 웹을 찾아보면 문장마다 출처를 붙인다. 그런데 세 문장이 **같은 자리**에서
 * 나왔으면 이렇게 된다 —
 *
 *     · 경로는 … 입니다. (ecfs.scourt.go.kr)
 *     · 미확인 문서라면 … 있습니다. (ecfs.scourt.go.kr)
 *     · 사용설명서는 … 기준입니다. (ecfs.scourt.go.kr)
 *     ─────────────────────────────
 *     웹에서 찾은 자리 — ecfs.scourt.go.kr
 *
 * 같은 주소가 **네 번** 나온다. 읽는 사람에게 아무 정보도 안 주면서 줄만 차지한다.
 * 실제로 화면이 그렇게 보였다.
 *
 * ── 어떻게 ────────────────────────────────────────────────
 * 신문 각주와 같은 방식으로 바꾼다. 본문에는 `[1]` 만 남기고,
 * 아래 목록에 `[1] ecfs.scourt.go.kr` 로 한 번만 적는다.
 * 같은 자리를 열 번 인용해도 본문은 `[1]` 열 개이고 목록은 한 줄이다.
 *
 * ── 주소를 견주는 방법 ────────────────────────────────────
 * 본문에 박힌 주소와 목록의 주소가 **글자로는 다를 수 있다** —
 * 추적용 꼬리표(`?utm_source=…`)나 `#`, 끝의 `/` 가 붙었다 말았다 한다.
 * 그래서 그것들을 떼고 견준다. 안 그러면 같은 자리인데 번호가 둘로 갈린다.
 */

/** 본문에 박힌 링크 — `([보이는 글](주소))` 또는 `[보이는 글](주소)` */
const LINK = /\(?\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)\)?/g

export type Numbered = {
  /** 링크가 번호로 바뀐 본문 */
  text: string
  /** 아래에 붙일 목록. 번호는 1부터 */
  sources: WebSource[]
}

export function numberCitations(text: string, sources: readonly WebSource[]): Numbered {
  if (sources.length === 0) return { text, sources: [] }

  const indexOf = new Map<string, number>()
  sources.forEach((s, i) => indexOf.set(normalize(s.url), i + 1))

  const replaced = text.replace(LINK, (whole, _label, url) => {
    const n = indexOf.get(normalize(url))
    return n === undefined ? whole : `[${n}]`
  })

  return { text: tidy(replaced), sources: [...sources] }
}

/**
 * 견주기 위해 주소를 다듬는다.
 *
 * 떼는 것 — 추적 꼬리표(utm_*, ref) · 조각(#…) · 끝 슬래시 · www.
 * 나머지 물음표 값은 남긴다. 그건 실제로 다른 문서를 가리킬 수 있다.
 */
function normalize(raw: string): string {
  try {
    const u = new URL(raw)
    u.hash = ''
    for (const k of [...u.searchParams.keys()]) {
      if (/^utm_/i.test(k) || k === 'ref' || k === 'source') u.searchParams.delete(k)
    }
    const host = u.hostname.replace(/^www\./, '')
    const path = u.pathname.replace(/\/$/, '')
    return `${host}${path}${u.search}`.toLowerCase()
  } catch {
    return raw.trim().toLowerCase()
  }
}

/**
 * 링크를 걷어낸 뒤 남는 자국을 치운다.
 *
 * 「… 있습니다. ()」 처럼 빈 괄호가 남거나, 번호 앞에 공백이 두 칸 생긴다.
 * 사소해 보여도 이런 게 쌓이면 "대충 만든 화면"으로 읽힌다.
 */
function tidy(s: string): string {
  return s
    .replace(/\(\s*\)/g, '')          // 빈 괄호
    .replace(/\(\s*(\[\d+\])\s*\)/g, '$1') // 괄호로 감싼 번호
    .replace(/\s+([.,!?])/g, '$1')    // 문장부호 앞 공백
    .replace(/[ \t]{2,}/g, ' ')       // 이어진 공백
    .replace(/[ \t]+$/gm, '')         // 줄 끝 공백
}
