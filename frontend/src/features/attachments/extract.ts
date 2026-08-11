/**
 * 올린 파일에서 글을 뽑는다.
 *
 * 왜 브라우저에서 하나 —
 *   서버에서 뽑으려면 파일을 서버로 보내야 하고, 그러면 계약서·급여대장이
 *   한 번 더 밖으로 나간다. 브라우저에서 뽑으면 **AI 에게 보내기로 한 것만**
 *   밖으로 나간다.
 *
 * 못 뽑는 형식이 있다. 그때 아는 척하지 않는 게 중요하다 —
 *   `불가` 로 표시하고 이유를 남긴다. AI 는 그 파일에 대해 "못 읽었습니다"라고 답한다.
 *   글자를 반쯤 뽑아 놓고 답하면 **틀린 답이 근거 있는 답처럼 보인다.**
 */

/** AI 에게 한 파일에서 넘기는 글자 수 상한. 넘으면 앞부분만 쓴다 */
export const TEXT_LIMIT = 60_000

export type ExtractResult = {
  status: '성공' | '불가' | '실패'
  text: string | null
  note: string | null
}

const TEXTUAL = /^(text\/|application\/(json|xml|x-yaml|yaml))/
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|xml|ya?ml|log|html?)$/i

export async function extractText(file: File): Promise<ExtractResult> {
  const name = file.name.toLowerCase()

  try {
    if (TEXTUAL.test(file.type) || TEXT_EXT.test(name)) {
      return ok(await file.text())
    }
    if (name.endsWith('.pdf') || file.type === 'application/pdf') {
      return ok(await fromPdf(file))
    }
    if (name.endsWith('.docx')) {
      return ok(await fromDocx(file))
    }

    if (name.endsWith('.hwp') || name.endsWith('.hwpx')) {
      return no('한글(hwp) 파일은 읽지 못합니다. PDF로 저장해 다시 올리시면 읽습니다.')
    }
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      return no('엑셀 파일은 읽지 못합니다. 필요한 표를 복사해 「상세」에 붙여 넣으시면 그걸 봅니다.')
    }
    if (name.endsWith('.doc')) {
      return no('옛 워드(.doc) 형식은 읽지 못합니다. .docx 나 PDF로 저장해 주세요.')
    }
    if (file.type.startsWith('image/')) {
      return no('그림 파일 안의 글자는 읽지 못합니다. 보관은 됩니다.')
    }
    return no(`${file.type || '알 수 없는 형식'} — 글을 뽑지 못하는 형식입니다. 보관은 됩니다.`)
  } catch (e) {
    return {
      status: '실패',
      text: null,
      note: `파일을 여는 중 문제가 났습니다 — ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

function ok(raw: string): ExtractResult {
  // ﻿ = 파일 맨 앞에 붙는 눈에 안 보이는 표식(BOM). 그대로 두면 AI 가 글자로 센다
  const text = raw.replace(/﻿/g, '').trim()
  if (!text) {
    return no('파일은 열렸지만 글자가 없었습니다. 스캔한 그림일 수 있습니다.')
  }
  if (text.length > TEXT_LIMIT) {
    return {
      status: '성공',
      text: text.slice(0, TEXT_LIMIT),
      note: `너무 길어 앞 ${TEXT_LIMIT.toLocaleString()}자만 읽었습니다 (전체 ${text.length.toLocaleString()}자).`,
    }
  }
  return { status: '성공', text, note: null }
}

function no(note: string): ExtractResult {
  return { status: '불가', text: null, note }
}

/**
 * PDF.
 *
 * pdfjs 는 무겁다 — 화면을 열 때가 아니라 **PDF를 실제로 올릴 때** 불러온다.
 * 그래서 정적 import 가 아니라 동적 import 다.
 */
async function fromPdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const line = content.items
      .map((it) => ('str' in it ? it.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    // 쪽 번호를 붙인다 — AI 가 "3쪽에 이렇게 적혀 있습니다"라고 답할 수 있게
    if (line) pages.push(`[${i}쪽] ${line}`)
  }
  return pages.join('\n\n')
}

async function fromDocx(file: File): Promise<string> {
  const mammoth = await import('mammoth')
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  return value
}

/** 「1.2 MB」처럼 보여준다 */
export function formatSize(bytes: number | null): string {
  if (bytes === null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
