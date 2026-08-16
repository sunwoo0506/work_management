/**
 * 실시간 받아쓰기 → 회의록 초안 사이의 계산.
 *
 * 마이크·AI 는 여기 없다. 여기 있는 것은 **들린 말을 줄로 정리하고,
 * AI 가 돌려준 글을 칸으로 나누는 일**뿐이다. 그래야 브라우저 없이 시험할 수 있다
 * (CLAUDE.md — "판단이 필요 없는 것은 전부 domain 으로").
 *
 * ⚠️ 시각은 전부 **회의 시작으로부터 흐른 밀리초**다. 벽시계가 아니다.
 *    회의를 잠시 멈췄다 다시 켜도 이어지는 값이라, 시간대·서머타임과 무관하다.
 */

export type Segment = {
  /** 회의 시작으로부터 흐른 시간 (밀리초) */
  at: number
  text: string
  /** 사용자가 「중요」로 찍은 대목 */
  mark?: boolean
}

export type GlossaryPair = { term: string; means: string }

/** AI 가 돌려준 회의록 초안을 칸으로 나눈 것 */
export type Minutes = {
  summary: string[]
  decisions: string[]
  followUps: string[]
  /** 잘못 들린 것 같아 사람이 확인해야 하는 대목 */
  checks: string[]
}

/** 이어 붙일지 새 줄로 뗄지 가르는 간격. 6초 넘게 비면 다른 말로 본다 */
const MERGE_GAP_MS = 6_000
/** 한 줄이 이보다 길어지면 읽기 어려워서 뗀다 */
const MERGE_MAX_CHARS = 160

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** 흐른 시간을 「분:초」로. 한 시간을 넘으면 「시:분:초」 */
export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const s = total % 60
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600)
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/**
 * 확정된 말 한 토막을 붙인다.
 *
 * 받아쓰기는 숨 쉬는 자리마다 토막을 끊어 준다. 그대로 쌓으면 두세 글자짜리
 * 줄이 수백 개가 되어 읽을 수 없다. 그래서 **짧은 간격으로 이어진 토막은 한 줄로 합친다.**
 *
 * 같은 말이 두 번 오는 일도 있다(받아쓰기가 확정을 다시 보낸다).
 * 앞 줄의 꼬리와 같으면 버린다 — 안 버리면 회의록에 같은 문장이 두 번 적힌다.
 */
export function appendFinal(segments: readonly Segment[], raw: string, at: number): Segment[] {
  const text = raw.trim()
  if (!text) return segments as Segment[]

  const last = segments[segments.length - 1]
  if (last && last.text.endsWith(text)) return segments as Segment[]

  const joinable =
    last !== undefined &&
    !last.mark &&
    at - last.at < MERGE_GAP_MS &&
    last.text.length + text.length <= MERGE_MAX_CHARS

  if (joinable) {
    const merged = segments.slice()
    merged[merged.length - 1] = { ...last, text: `${last.text} ${text}` }
    return merged
  }
  return [...segments, { at, text }]
}

/** 「중요」 표시를 켜고 끈다. 회의 중에 눌러 두면 초안에서 우선으로 다뤄진다 */
export function toggleMark(segments: readonly Segment[], index: number): Segment[] {
  if (index < 0 || index >= segments.length) return segments as Segment[]
  return segments.map((s, i) => (i === index ? { ...s, mark: !s.mark } : s))
}

/**
 * 잘못 들린 줄을 고친다. 비우면 그 줄을 지운다.
 *
 * 받아쓰기는 사람 이름·사내 용어에서 특히 틀린다. 고칠 자리가 없으면
 * 틀린 말이 그대로 회의록에 굳는다.
 */
export function editSegment(segments: readonly Segment[], index: number, raw: string): Segment[] {
  if (index < 0 || index >= segments.length) return segments as Segment[]
  const text = raw.trim()
  if (!text) return segments.filter((_, i) => i !== index)
  return segments.map((s, i) => (i === index ? { ...s, text } : s))
}

/** 저장·AI 전달용 전사문. 「중요」로 찍은 줄에는 ★ 가 붙는다 */
export function transcriptText(segments: readonly Segment[]): string {
  return segments.map((s) => `[${clock(s.at)}]${s.mark ? ' ★' : ''} ${s.text}`).join('\n')
}

/** 회의가 얼마나 담겼나 — 화면에 「12줄 · 1,340자」로 보여 준다 */
export function transcriptStats(segments: readonly Segment[]): { lines: number; chars: number } {
  return {
    lines: segments.length,
    chars: segments.reduce((n, s) => n + s.text.length, 0),
  }
}

/**
 * 이번 회의에 실제로 나온 사내 용어만 골라낸다.
 *
 * 용어집 전체를 AI 에게 넘기지 않는 이유 —
 * 용어가 100개로 늘면 그게 다 비용이고, 상관없는 말이 섞이면 오히려 헷갈린다.
 * 나온 것만 넘긴다 (설계서 §5.8 「사내 용어 교정」).
 */
export function usedGlossary(text: string, glossary: readonly GlossaryPair[]): GlossaryPair[] {
  const haystack = text.toLowerCase()
  return glossary.filter((g) => {
    const term = g.term.trim().toLowerCase()
    return term.length > 0 && haystack.includes(term)
  })
}

// ── AI 초안 나누기 ────────────────────────────────────────
//
// AI 에게 「[요약] [결정] [할 일] [확인 필요]」 네 칸으로 답하라고 시킨다.
// 그래도 머리표(#·**·번호)를 붙여 오는 일이 있으므로 느슨하게 읽는다.
// 못 알아들으면 빈 칸을 돌려주고, 화면은 원문을 그대로 보여 준다 —
// 형식이 어긋났다고 사람이 말한 것을 잃으면 안 된다.

const HEADINGS: { key: keyof Minutes; words: string[] }[] = [
  { key: 'summary', words: ['요약', '정리', '개요'] },
  { key: 'decisions', words: ['결정', '결정사항', '합의'] },
  { key: 'followUps', words: ['할 일', '할일', '후속조치', '후속', '액션'] },
  { key: 'checks', words: ['확인 필요', '확인필요', '확인', '불확실'] },
]

/** 머리표·괄호·별표를 걷어낸 알맹이 */
function strip(line: string): string {
  return line
    .replace(/^[\s#>*\-·•\d.)\][【】]+/, '')
    .replace(/[*_`]/g, '')
    .replace(/[[\]【】:：]+\s*$/, '')
    .trim()
}

function headingOf(line: string): keyof Minutes | null {
  const bare = strip(line).replace(/[:：]/g, '').trim()
  if (bare.length === 0 || bare.length > 8) return null
  for (const h of HEADINGS) {
    if (h.words.includes(bare)) return h.key
  }
  return null
}

export function parseMinutes(text: string): Minutes {
  const out: Minutes = { summary: [], decisions: [], followUps: [], checks: [] }
  let current: keyof Minutes | null = null

  for (const line of text.split('\n')) {
    if (!line.trim()) continue

    const heading = headingOf(line)
    if (heading) {
      current = heading
      continue
    }
    if (!current) continue

    const item = strip(line)
    // 「없음」은 AI 가 빈 칸을 채우려고 적는 말이다. 항목으로 담지 않는다
    if (!item || item === '없음' || item === '-') continue
    out[current].push(item.slice(0, 300))
  }
  return out
}
