/**
 * 빌드 결과물에 열쇠가 섞여 들어갔는지 훑는다.
 *
 * 왜 따로 두나 —
 *   vite.config.ts 의 검사는 **환경변수 이름과 값**을 본다. 그건 실수 하나를 막는다.
 *   이건 **다 만들어진 파일**을 본다 — 코드에 문자열로 박아 넣은 것까지 잡힌다.
 *   두 검사가 보는 곳이 다르다.
 *
 * 설계서 수용 기준에 있는 항목이다. 사람이 기억해서 하는 대신 명령 하나로 만든다.
 *
 *     npm run check:keys      (npm run build 뒤에 자동으로 돈다)
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { exit } from 'node:process'

const DIST = 'dist'

/** 잡을 것. 이름이 아니라 **값의 모양**을 본다 */
const PATTERNS = [
  { re: /sk-[A-Za-z0-9_-]{20,}/, what: 'OpenAI 열쇠로 보이는 문자열 (sk-…)' },
  { re: /sk-ant-[A-Za-z0-9_-]{20,}/, what: 'Anthropic 열쇠로 보이는 문자열' },
  { re: /service_role/, what: 'service_role — RLS 를 통째로 우회하는 마스터 키' },
  { re: /"role"\s*:\s*"service_role"/, what: 'service_role 이 든 JWT' },
]

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(path)
    else yield path
  }
}

const found = []
try {
  for await (const file of walk(DIST)) {
    if (!/\.(js|mjs|css|html|json|map)$/.test(file)) continue
    const text = await readFile(file, 'utf8')
    for (const p of PATTERNS) {
      const m = text.match(p.re)
      if (m) found.push({ file, what: p.what, sample: mask(m[0]) })
    }
  }
} catch (e) {
  if (e.code === 'ENOENT') {
    console.error(`${DIST}/ 가 없습니다. 먼저 npm run build 를 하세요.`)
    exit(1)
  }
  throw e
}

if (found.length > 0) {
  console.error('\n🔴 빌드 결과물에 열쇠로 보이는 것이 있습니다. 배포하면 안 됩니다.\n')
  for (const f of found) console.error(`   ${f.file}\n     ${f.what}\n     → ${f.sample}\n`)
  console.error('   AI 열쇠는 Edge Function 에만 둡니다 — supabase/.env.example 참고.\n')
  exit(1)
}

console.log('✓ 빌드 결과물에 열쇠 문자열 없음')

/** 진짜 열쇠였을 경우를 대비해 화면·로그에 통째로 찍지 않는다 */
function mask(s) {
  return s.length <= 12 ? s : `${s.slice(0, 8)}…${s.slice(-4)} (${s.length}자)`
}
