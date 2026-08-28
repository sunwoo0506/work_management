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

/**
 * AI 초안을 **네 칸으로 줄여 본 것.** 실시간 회의 화면이 훑어볼 때와
 * `ai_draft`(초안 원본)에 담을 때 쓴다.
 *
 * ⚠️ 회의록 **양식**은 이것이 아니라 `domain/minutes.ts` 의 `MinutesDoc` 다.
 *    2026-08-28 에 양식을 회사 서식(안건별 4단 + 조치사항 표 + 참석자 확인란)으로
 *    바꾸면서, 여기 있던 `parseMinutes`(AI 글을 이 네 칸으로 나누던 것)를 **지웠다.**
 *    같은 글을 두 벌로 나누고 있어서 형식이 바뀔 때마다 두 곳을 고쳐야 했고,
 *    실제로 한쪽만 고쳐 놓아 「요약」 칸이 늘 비어 있었다.
 *    지금은 `minutes.ts` 의 `draftView(doc)` 가 양식에서 이 네 칸을 뽑아 준다.
 */
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
 * 벽시계 시각을 「HH:MM」으로 — **회의 시작·종료 시각을 오갈 때 쓴다.**
 *
 * 세 곳의 표기가 서로 다르기 때문에 한 곳에서 맞춘다.
 *   저장소  「14:00:00」 (초까지 온다)
 *   입력칸  「14:00」    (초가 붙으면 브라우저가 안 받기도 한다)
 *   Date    지금 시각을 찍을 때
 *
 * ⚠️ `clock()` 과 헷갈리지 않는다. 저건 **흐른 시간**(00:42 = 42초),
 *    이건 **시각**(14:00 = 오후 2시)이다. 둘 다 콜론이 들어가 눈으로는 비슷하다.
 *
 * 알아볼 수 없는 값은 빈 문자열로 돌려준다 — 화면이 죽지 않게 한다.
 */
export function hhmm(v: string | Date | null | undefined): string {
  if (!v) return ''
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return ''
    return `${pad(v.getHours())}:${pad(v.getMinutes())}`
  }
  const m = v.trim().match(/^(\d{1,2}):(\d{2})/)
  if (!m) return ''
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return ''
  return `${pad(h)}:${pad(min)}`
}

/**
 * 「14:00~15:30」처럼 묶어 준다. 한쪽만 있으면 그것만 낸다.
 * 둘 다 없으면 빈 문자열 — 화면이 「~」만 덩그러니 그리지 않게 한다.
 */
export function timeRange(from: string | null | undefined, to: string | null | undefined): string {
  const a = hhmm(from)
  const b = hhmm(to)
  if (a && b) return `${a}~${b}`
  return a || b
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


/**
 * 나중에 받아쓴 글을 **시각에 맞는 자리에** 끼워 넣는다.
 *
 * ── 왜 필요한가 ──────────────────────────────────────────
 * 받아쓰기에 실패한 토막을 나중에 다시 보내면 글이 뒤늦게 도착한다.
 * 그걸 맨 뒤에 붙이면 **회의 순서가 뒤죽박죽이 된다** — 12분에 한 말이
 * 55분 뒤에 적혀 있으면 회의록으로 못 쓴다.
 *
 * 줄 앞의 `[분:초]` 를 읽어 제자리를 찾아 끼운다.
 * 시각이 없는 줄(사람이 손으로 적은 것)은 순서를 건드리지 않고 그대로 둔다.
 */
export function mergeIntoTranscript(existing: string, at: number, text: string): string {
  const line = `[${clock(at)}] ${text.trim()}`
  if (!existing.trim()) return line

  const lines = existing.split('\n')
  const stamp = (l: string): number | null => {
    const m = l.match(/^\[(?:(\d+):)?(\d{1,2}):(\d{2})\]/)
    if (!m) return null
    const h = m[1] ? Number(m[1]) : 0
    return (h * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000
  }

  for (let i = 0; i < lines.length; i++) {
    const t = stamp(lines[i])
    if (t !== null && t > at) {
      return [...lines.slice(0, i), line, ...lines.slice(i)].join('\n')
    }
  }
  return `${existing}\n${line}`
}

/**
 * 다른 데서 받아쓴 글을 우리 형식에 맞게 다듬는다.
 *
 * ── 왜 손보나 ────────────────────────────────────────────
 * 폰 녹음기 앱이 만든 글은 우리가 만든 것과 모양이 다르다 —
 * 시각이 `00:12` 처럼 대괄호 없이 붙거나, 빈 줄이 잔뜩 끼거나,
 * 줄 끝에 공백이 남는다. 그대로 두면 **나중에 조각을 제자리에 끼워 넣을 때**
 * (mergeIntoTranscript) 시각을 못 읽어 순서가 엉킨다.
 *
 * 반대로 **내용은 손대지 않는다.** 화자 이름(「화자 1:」)도 지우지 않는다 —
 * 누가 말했는지는 우리 받아쓰기가 못 하는 귀한 정보다.
 */
export function tidyTranscript(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      const t = line.trim()
      // 줄 앞의 시각을 대괄호 형태로 통일한다: 00:12 / 0:12 / (00:12) → [00:12]
      return t.replace(/^[([]?(\d{1,2}:\d{2}(?::\d{2})?)[)\]]?\s*/, '[$1] ')
    })
    .filter((line, i, all) => {
      if (line !== '') return true
      // 빈 줄이 이어지면 하나만 남긴다
      return i > 0 && all[i - 1] !== ''
    })
    .join('\n')
    .trim()
}
