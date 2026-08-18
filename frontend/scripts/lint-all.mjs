/**
 * 검사기를 **화면과 Edge Function 양쪽에** 돌린다.
 *
 * ── 왜 스크립트를 따로 두나 ─────────────────────────────────
 * 검사기는 자기가 실행된 폴더 위쪽 경로(`..`)를 거부한다. 그런데 화면은
 * `frontend/`, Edge Function 은 `supabase/functions/` 에 있어 **한 번에 못 훑는다.**
 * 그래서 저장소 뿌리에서 한 번 부른다.
 *
 * ── 왜 이걸 지금 만들었나 ───────────────────────────────────
 * 2026-08-18 에 Edge Function 이 **검사 범위 밖**이라는 걸 알았다.
 * AI 에게 보낼 분류 규칙을 계산해 놓고 메시지에 안 넣은 결함이 있었는데,
 * 검사기는 그걸 잡을 수 있었다 — **아무도 그 폴더에 안 돌렸을 뿐이다.**
 *
 * ── 설정 파일에 왜 설명이 없나 ──────────────────────────────
 * 검사기 설정 파일(.oxlintrc.json)은 **모르는 항목을 하나라도 만나면 통째로
 * 거부한다.** 주석 자리가 없다. 그래서 「왜 이렇게 뒀나」는 전부 여기 적는다.
 *
 * 지금 그 파일에 있는 것 중 설명이 필요한 것 —
 *   no-unused-vars: "error"
 *     만들어 놓고 안 쓰는 값. 8/18 에 경고에서 **오류로 올렸다.**
 *     경고로 두면 종료코드가 0 이라 빌드가 통과하고 아무도 안 본다.
 *     이 결함은 증상이 없어서, 검사기가 막지 않으면 배포까지 그대로 간다.
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONTEND = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const ROOT = join(FRONTEND, '..')
const BIN = join(FRONTEND, 'node_modules', '.bin', process.platform === 'win32' ? 'oxlint.cmd' : 'oxlint')

const r = spawnSync(
  BIN,
  ['-c', 'frontend/.oxlintrc.json', 'frontend/src', 'frontend/scripts', 'supabase/functions'],
  { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' },
)
process.exit(r.status ?? 1)
