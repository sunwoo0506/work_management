import type { MinutesDoc } from '../../domain/minutes'
import { timeRange } from '../../domain/transcript'

/**
 * 회의록을 **PDF로 내려받게** 한다.
 *
 * ── 왜 인쇄 창을 여나 ────────────────────────────────────
 * PDF 를 만드는 라이브러리를 넣으면 **한글 글꼴을 같이 담아야 한다.** 그것만 몇 MB 라
 * 화면 여는 속도가 눈에 띄게 느려진다. 회의록 하나 뽑자고 치를 값이 아니다.
 *
 * 브라우저에는 이미 **「PDF 로 저장」이 들어 있다.** 인쇄 창을 열어 주면
 * 사용자가 그 자리에서 PDF 로 저장한다. 한글도 그대로 나온다 — 브라우저가 쓰던 글꼴이니까.
 *
 * ⚠️ 화면 모양을 그대로 인쇄하지 않는다. 화면은 **고치는 자리**라 입력칸·버튼이 많은데,
 *    그게 종이에 찍히면 회의록이 아니라 화면 사진이 된다. **인쇄용 문서를 따로 그린다.**
 */

export type MinutesHead = {
  title: string
  metOn: string
  place?: string | null
  attendees?: string | null
  writer?: string | null
  durationSec?: number | null
  /** 회의 시작·종료 벽시계 시각. 양식 1번 기본정보의 「시간」 칸 */
  startedAt?: string | null
  endedAt?: string | null
}

/** 인쇄용 문서를 그린다 */
function html(m: MinutesDoc, head: MinutesHead): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const rows = (arr: string[]) =>
    arr.length ? arr.map((x) => `<li>${esc(x)}</li>`).join('') : '<li class="none">없음</li>'

  const table = (head2: string[], body: string[][]) => {
    if (body.length === 0) return '<p class="none">없음</p>'
    return `<table>
      <thead><tr>${head2.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${body
        .map((r) => `<tr>${r.map((c) => `<td>${esc(c || '')}</td>`).join('')}</tr>`)
        .join('')}</tbody>
    </table>`
  }

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8" />
<title>${esc(head.title)} 회의록</title>
<style>
  /* 종이에 맞춘 서식. 화면 서식(Tailwind)과 섞지 않는다 */
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: -apple-system, "Malgun Gothic", "맑은 고딕", sans-serif;
         color: #1d1d1f; font-size: 10.5pt; line-height: 1.55; }
  h1 { font-size: 18pt; margin: 0 0 14px; letter-spacing: -0.5px; }
  h2 { font-size: 12pt; margin: 22px 0 8px; padding-bottom: 4px;
       border-bottom: 1px solid #d0d0d0; }
  dl { display: grid; grid-template-columns: 90px 1fr; gap: 4px 12px; margin: 0; }
  dt { color: #666; }
  ul { margin: 0; padding-left: 18px; }
  li { margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { border: 1px solid #d0d0d0; padding: 6px 8px; text-align: left;
           vertical-align: top; word-break: break-word; }
  th { background: #f5f5f7; font-weight: 600; }
  .none { color: #999; }
  .foot { margin-top: 26px; padding-top: 10px; border-top: 1px solid #e0e0e0;
          color: #777; font-size: 9pt; }
  /* 표가 쪽 경계에서 잘리지 않게 */
  tr, li { break-inside: avoid; }
</style></head>
<body>
  <h1>회의록</h1>

  <h2>1. 회의 기본정보</h2>
  <dl>
    <dt>회의명</dt><dd>${esc(head.title)}</dd>
    <dt>일시</dt><dd>${esc(head.metOn)}${
      timeRange(head.startedAt, head.endedAt) ? ` ${esc(timeRange(head.startedAt, head.endedAt))}` : ''
    }${head.durationSec ? ` (${Math.round(head.durationSec / 60)}분)` : ''}</dd>
    ${head.place ? `<dt>장소/방식</dt><dd>${esc(head.place)}</dd>` : ''}
    ${head.attendees ? `<dt>참석자</dt><dd>${esc(head.attendees)}</dd>` : ''}
    ${head.writer ? `<dt>작성자</dt><dd>${esc(head.writer)}</dd>` : ''}
  </dl>

  <h2>2. 회의 목적</h2>
  <ul>${rows(m.purpose)}</ul>

  <h2>3. 주요 안건</h2>
  <ul>${rows(m.agenda)}</ul>

  <h2>4. 안건별 논의 내용</h2>
  ${table(['안건', '주요 논의 내용', '결과'], m.discussions.map((d) => [d.topic, d.points, d.result]))}

  <h2>5. 결정사항</h2>
  ${table(['No.', '결정 내용', '비고'], m.decisions.map((d, i) => [String(i + 1), d.text, d.note]))}

  <h2>6. Action Item</h2>
  ${table(
    ['No.', '해야 할 일', '담당자', '완료기한', '상태'],
    m.actions.map((a, i) => [String(i + 1), a.text, a.owner, a.due, a.status || '예정']),
  )}

  <h2>7. 미결 · 추가 확인사항</h2>
  <ul>${rows(m.pending)}</ul>

  <h2>8. 다음 회의</h2>
  <dl>
    <dt>예정일</dt><dd>${esc(m.next.date) || '<span class="none">미정</span>'}</dd>
    <dt>주요 안건</dt><dd>${esc(m.next.agenda) || '<span class="none">미정</span>'}</dd>
  </dl>

  ${
    m.checks.length > 0
      ? `<h2>확인 필요</h2><ul>${rows(m.checks)}</ul>
         <p class="foot">위 항목은 자동 받아쓰기에서 잘못 들렸을 수 있는 대목입니다. 확인 후 확정하세요.</p>`
      : ''
  }
</body></html>`
}

/**
 * 인쇄 창을 연다. 사용자가 거기서 「PDF 로 저장」을 고른다.
 *
 * 새 창이 막혀 있으면(팝업 차단) 알려 준다 — 조용히 아무 일도 안 일어나면
 * 「눌렀는데 안 된다」가 된다.
 */
export function printMinutes(m: MinutesDoc, head: MinutesHead): boolean {
  const win = window.open('', '_blank', 'width=900,height=1000')
  if (!win) return false

  win.document.write(html(m, head))
  win.document.close()
  // 글꼴·서식이 자리 잡은 뒤에 인쇄 창을 띄운다
  win.onload = () => {
    win.focus()
    win.print()
  }
  setTimeout(() => {
    try {
      win.focus()
      win.print()
    } catch {
      // 이미 떴으면 무시
    }
  }, 400)
  return true
}
