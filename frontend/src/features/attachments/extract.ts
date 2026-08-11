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
    if (name.endsWith('.hwpx')) {
      return ok(await fromHwpx(file))
    }

    if (name.endsWith('.hwp')) {
      return no(
        '한글 옛 형식(.hwp)은 읽지 못합니다. ' +
          '한글에서 「다른 이름으로 저장」 → **.hwpx** 나 PDF 로 저장해 올리시면 읽습니다.',
      )
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

/**
 * 한글 새 형식(.hwpx).
 *
 * ── 왜 이건 되고 .hwp 는 안 되나 ─────────────────────────
 *   .hwpx  압축된 폴더 안에 **XML 글자 파일**이 들어 있다. 풀어서 읽으면 된다
 *   .hwp   한글 전용 이진 형식. 규격이 공개돼 있어도 브라우저에서 풀려면
 *          별도 해독기가 필요하다. 그래서 「.hwpx 로 저장해 주세요」로 안내한다
 *
 * ── 어떻게 읽나 ──────────────────────────────────────────
 * 압축을 풀면 `Contents/section0.xml`, `section1.xml` … 이 나온다.
 * 글자는 `<hp:t>` 안에 있고 문단은 `<hp:p>` 로 나뉜다.
 * 문단마다 줄바꿈을 넣어야 표나 목록이 한 줄로 뭉개지지 않는다.
 *
 * 압축 푸는 도구(fflate)는 **hwpx 를 실제로 올릴 때만** 내려받는다.
 */
async function fromHwpx(file: File): Promise<string> {
  const { unzipSync, strFromU8 } = await import('fflate')
  const zip = unzipSync(new Uint8Array(await file.arrayBuffer()))

  const sections = Object.keys(zip)
    .filter((n) => /^Contents\/section\d+\.xml$/i.test(n))
    .sort((a, b) => sectionNo(a) - sectionNo(b))

  if (sections.length === 0) {
    // 압축은 풀렸는데 한글 문서의 모양이 아니다 — 확장자만 hwpx 인 파일일 수 있다
    throw new Error('한글 문서의 본문(Contents/section0.xml)을 찾지 못했습니다.')
  }

  return sections
    .map((name) => hwpxSectionToText(strFromU8(zip[name])))
    .filter(Boolean)
    .join('\n')
}

/**
 * 한글 본문 XML 한 장 → 글.
 *
 * 압축 풀기와 떼어 놨다. 이 부분이 실제로 틀리기 쉬운 자리라 따로 시험한다.
 */
export function hwpxSectionToText(xml: string): string {
  const out: string[] = []
  // 문단 단위로 자른 뒤 그 안의 글자 조각만 모은다
  for (const para of xml.split(/<hp:p[\s>]/)) {
    const text = [...para.matchAll(/<hp:t(?:\s[^>]*)?>([\s\S]*?)<\/hp:t>/g)]
      .map((m) => unescapeXml(m[1]))
      .join('')
      .trim()
    if (text) out.push(text)
  }
  return out.join('\n')
}

function sectionNo(name: string): number {
  return Number(name.match(/section(\d+)/i)?.[1] ?? 0)
}

/** XML 에서 특수문자는 &amp; 처럼 바뀌어 들어 있다. 사람이 읽을 글자로 되돌린다 */
function unescapeXml(s: string): string {
  return s
    .replace(/<[^>]*>/g, '') // 글자 사이에 낀 표시용 태그 제거
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&') // 맨 마지막 — 먼저 풀면 &amp;lt; 가 < 로 잘못 바뀐다
}

/** 「1.2 MB」처럼 보여준다 */
export function formatSize(bytes: number | null): string {
  if (bytes === null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
