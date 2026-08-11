/**
 * AI 답을 읽기 좋게 그린다.
 *
 * ── 왜 필요했나 ──────────────────────────────────────────
 * 클로니가 굵은 글씨·목록·링크가 섞인 글을 돌려주는데, 화면은 그걸
 * **글자 그대로** 뿌리고 있었다. 그래서 이렇게 보였다 —
 *
 *     - 웹에서 찾아보니 경로는 **전자소송포털 → 나의문서함**입니다. ([ecfs.scourt.go.kr](https://…))
 *
 * 별표와 대괄호가 그대로 보이고, 링크는 눌리지도 않았다.
 * 출처를 눌러 확인할 수 없으면 근거를 붙인 의미가 없다.
 *
 * ── 왜 라이브러리를 안 쓰나 ──────────────────────────────
 * 마크다운 라이브러리는 대개 HTML 문자열을 만들어 그대로 꽂는다(innerHTML).
 * AI 가 돌려준 글에 그렇게 하면 **AI 답이 곧 실행 코드가 되는 길**이 열린다.
 * 여기서 만드는 것은 처음부터 끝까지 React 조각이라 그 길이 없다.
 *
 * 다루는 것만 다룬다 — 문단 · 목록 · 굵게 · 링크 · 인라인 코드.
 * 표나 이미지는 안 다룬다. 필요해지면 그때 늘린다.
 */

export function Markdown({ text }: { text: string }) {
  return <div className="space-y-2">{blocks(text)}</div>
}

/** 빈 줄로 문단을 나누고, 줄 첫머리를 보고 목록인지 판단한다 */
function blocks(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const lines = text.replace(/\r\n/g, '\n').split('\n')

  let i = 0
  let key = 0
  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) {
      i += 1
      continue
    }

    // 제목 — ### 무엇
    const heading = line.match(/^\s*#{1,6}\s+(.*)$/)
    if (heading) {
      out.push(
        <p key={key++} className="text-body font-semibold">
          {inline(heading[1])}
        </p>,
      )
      i += 1
      continue
    }

    // 목록 — 이어지는 줄을 한 덩어리로 모은다
    if (isBullet(line) || isNumbered(line)) {
      const ordered = isNumbered(line)
      const items: string[] = []
      while (i < lines.length && (isBullet(lines[i]) || isNumbered(lines[i]))) {
        items.push(lines[i].replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ''))
        i += 1
      }
      out.push(
        ordered ? (
          <ol key={key++} className="list-decimal pl-5 space-y-1">
            {items.map((t, n) => <li key={n} className="leading-relaxed">{inline(t)}</li>)}
          </ol>
        ) : (
          <ul key={key++} className="space-y-1">
            {items.map((t, n) => (
              <li key={n} className="leading-relaxed pl-4 -indent-4">
                <span className="text-ink-mute">· </span>
                {inline(t)}
              </li>
            ))}
          </ul>
        ),
      )
      continue
    }

    // 구분선
    if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)) {
      out.push(<hr key={key++} className="border-hairline" />)
      i += 1
      continue
    }

    // 그 밖은 문단 — 빈 줄이 나올 때까지 이어 붙인다
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !isBullet(lines[i]) && !isNumbered(lines[i])) {
      para.push(lines[i].trim())
      i += 1
    }
    out.push(
      <p key={key++} className="leading-relaxed">
        {inline(para.join(' '))}
      </p>,
    )
  }

  return out
}

function isBullet(line: string): boolean {
  return /^\s*[-*•]\s+/.test(line)
}

function isNumbered(line: string): boolean {
  return /^\s*\d+[.)]\s+/.test(line)
}

/**
 * 한 줄 안의 표시 — 굵게 · 링크 · 코드.
 *
 * 앞에서부터 훑으면서 만나는 순서대로 자른다.
 * 정규식 하나로 세 가지를 같이 잡아야 순서가 뒤엉키지 않는다.
 */
const INLINE = /(\*\*|__)(.+?)\1|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|`([^`]+)`|(https?:\/\/[^\s)]+)/g

function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let last = 0
  let key = 0

  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0
    if (at > last) out.push(text.slice(last, at))

    if (m[2] !== undefined) {
      out.push(<strong key={key++} className="font-semibold">{m[2]}</strong>)
    } else if (m[3] !== undefined && m[4] !== undefined) {
      out.push(<Link key={key++} href={m[4]}>{m[3]}</Link>)
    } else if (m[5] !== undefined) {
      out.push(
        <code key={key++} className="bg-canvas border border-hairline rounded px-1 text-caption">
          {m[5]}
        </code>,
      )
    } else if (m[6] !== undefined) {
      // 맨 주소 — 길면 화면을 밀어내므로 도메인만 보여 준다
      out.push(<Link key={key++} href={m[6]}>{domainOf(m[6])}</Link>)
    }

    last = at + m[0].length
  }

  if (last < text.length) out.push(text.slice(last))
  return out
}

/** 새 창으로 연다. noreferrer 를 빼면 우리 주소가 그쪽에 넘어간다 */
function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-action hover:underline break-all"
    >
      {children}
    </a>
  )
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
