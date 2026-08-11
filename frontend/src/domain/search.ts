/**
 * 업무 검색.
 *
 * ── 왜 해시태그를 안 만들었나 ──────────────────────────────
 *
 * 사용자가 물었다: *"#해시태그를 추가할까? 아니면 제목 + 설명으로 검색될 수 있게 할까"*
 *
 * 태그는 **미리 붙여야** 한다. 그런데 태그를 붙이는 순간에는
 * 6개월 뒤에 자기가 무슨 말로 찾을지 모른다. 그때 떠오르는 말은
 * 그때 상황의 말이지 붙일 때의 말이 아니다.
 *
 * 그리고 이미 「영역」이 태그 역할을 하고 있다. 태그를 또 만들면
 * 영역과 두 갈래가 되어 어느 쪽에 넣었는지 매번 헷갈린다.
 *
 * 그래서 **이미 적어 둔 글 전부**를 검색 대상으로 삼는다.
 * 사용자가 새로 해야 하는 일이 하나도 없다는 게 핵심이다.
 * 상세에 "구매사업본부"라고 적어 뒀으면 그 말로 찾힌다.
 *
 * 어디서 걸렸는지(제목인지 메모인지)를 같이 돌려준다 —
 * 안 그러면 왜 이게 검색됐는지 몰라서 결과를 안 믿게 된다.
 *
 * ── 지금은 화면에서 거른다 ────────────────────────────────
 *
 * 업무를 어차피 전부 불러와 두고 있어서 서버에 다시 물을 이유가 없다.
 * 수천 건이 되면 그때 데이터베이스 쪽 전문검색으로 옮긴다.
 * 그때 고칠 곳은 이 파일 하나다.
 */

/** 검색이 들여다보는 칸. 순서가 곧 표시 우선순위다 */
const FIELDS = [
  { key: 'title', label: '제목' },
  { key: 'detail', label: '상세' },
  { key: 'notes', label: '메모' },
  { key: 'reply_body', label: '회신' },
  { key: 'area', label: '영역' },
  { key: 'requester', label: '요청자' },
] as const

export type SearchHit = { field: string; snippet: string }

type Searchable = Record<string, unknown>

/**
 * 한 건이 검색어에 걸리나.
 *
 * 여러 낱말을 넣으면 **전부** 들어 있어야 한다(AND).
 * "회생 단가" 로 찾으면 둘 다 있는 것만 나온다 — 하나만 있는 것까지 나오면
 * 결과가 넘쳐서 검색을 안 쓰게 된다. 다만 낱말마다 **다른 칸**에 있어도 된다.
 */
export function matchTask(task: Searchable, query: string): SearchHit[] | null {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return null

  const hits = new Map<string, SearchHit>()

  for (const word of words) {
    let found = false
    for (const f of FIELDS) {
      const raw = task[f.key]
      if (typeof raw !== 'string' || !raw) continue
      const at = raw.toLowerCase().indexOf(word)
      if (at < 0) continue
      found = true
      // 같은 칸에서 여러 낱말이 걸리면 첫 번째 조각만 남긴다
      if (!hits.has(f.label)) hits.set(f.label, { field: f.label, snippet: snippet(raw, at, word.length) })
    }
    if (!found) return null // 한 낱말이라도 없으면 탈락
  }

  return [...hits.values()]
}

/** 걸린 자리 앞뒤를 조금 떼어 보여 준다. 제목은 짧으니 통째로 */
function snippet(text: string, at: number, len: number): string {
  if (text.length <= 60) return text
  const from = Math.max(0, at - 20)
  const to = Math.min(text.length, at + len + 30)
  return `${from > 0 ? '…' : ''}${text.slice(from, to).trim()}${to < text.length ? '…' : ''}`
}

/** 검색어에 걸리는 것만 남긴다. 검색어가 비면 전부 통과 */
export function filterTasks<T extends Searchable>(
  tasks: readonly T[],
  query: string,
): { task: T; hits: SearchHit[] }[] {
  if (!query.trim()) return tasks.map((task) => ({ task, hits: [] }))
  const out: { task: T; hits: SearchHit[] }[] = []
  for (const task of tasks) {
    const hits = matchTask(task, query)
    if (hits) out.push({ task, hits })
  }
  return out
}
