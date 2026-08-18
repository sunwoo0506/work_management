/**
 * Edge Function 문법 검사.
 *
 * ── 왜 필요한가 ─────────────────────────────────────────────
 * `npm run build` 는 화면(frontend)만 본다. Edge Function 은 Deno 로 도는
 * 별도 코드라 **아무것도 검사하지 않은 채 배포**된다.
 *
 * 2026-08-18 에 실제로 났다 — 프롬프트 규칙에 백틱(`)이 든 예시를 적었더니
 * 그게 템플릿 문자열을 닫아 파일 전체가 깨졌다. 눈으로는 멀쩡해 보였고,
 * 화면 빌드도 테스트도 전부 통과했다. **배포하고 나서야 알 뻔했다.**
 *
 * 여기서는 「문법이 맞나」까지만 본다. 타입까지 보려면 Deno 가 필요한데
 * 이 환경에 Deno 가 없다(Docker 도 없어 로컬 스택을 못 쓴다 — CLAUDE.md).
 * 완벽하진 않지만 **오늘 겪은 사고는 잡는다.**
 *
 * 검사기는 이미 깔려 있는 TypeScript 를 쓴다. 이것 하나 때문에 새 도구를
 * 들이지 않는다 — 안 쓰는 도구가 늘면 아무도 안 돌린다.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'supabase', 'functions')

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (name.endsWith('.ts')) out.push(p)
  }
  return out
}

let bad = 0
let seen = 0
for (const file of walk(ROOT)) {
  seen++
  const text = readFileSync(file, 'utf8')
  // 문법만 본다. import 는 따라가지 않는다 — jsr:·npm: 주소는 여기서 못 연다
  const src = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS)
  const errs = src.parseDiagnostics ?? []
  if (errs.length === 0) continue

  bad++
  console.error(`\n✕ ${relative(process.cwd(), file)}`)
  for (const d of errs.slice(0, 5)) {
    const { line } = src.getLineAndCharacterOfPosition(d.start ?? 0)
    console.error(`  ${line + 1}번째 줄 — ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`)
    console.error(`  → ${(text.split('\n')[line] ?? '').trim().slice(0, 100)}`)
  }
  if (errs.length > 5) console.error(`  … 그 밖에 ${errs.length - 5}개 더`)
}

if (bad > 0) {
  console.error(`\n✕ Edge Function ${bad}개가 깨져 있습니다. 이대로 배포하면 안 됩니다.`)
  process.exit(1)
}
console.log(`✓ Edge Function ${seen}개 문법 정상`)
