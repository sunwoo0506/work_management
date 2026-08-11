import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * 열쇠가 화면 쪽으로 새면 **빌드를 멈춘다.**
 *
 * 왜 —
 *   Vite 는 `VITE_` 로 시작하는 값만 화면에 싣는다. 그래서 `OPENAI_API_KEY=...`
 *   를 frontend/.env.local 에 넣어도 당장은 안 샌다. 문제는 그 다음이다 —
 *   "왜 AI가 안 되지?" 하다가 `VITE_OPENAI_API_KEY` 로 이름을 바꿔 보는 순간
 *   **열쇠가 통째로 화면 소스에 실린다.** 화면 소스는 누구나 연다.
 *
 *   그 한 번의 실수를 사람 주의력에 맡기지 않는다. 여기서 막는다.
 *
 * 무엇을 보나 —
 *   ① `VITE_` 로 시작하면서 이름에 KEY·SECRET·TOKEN·PASSWORD 가 든 것
 *      (단 SUPABASE_ANON_KEY 는 원래 브라우저에 들어가는 값이라 통과)
 *   ② 값이 `sk-` 처럼 열쇠 모양인 것 — 이름이 뭐든 상관없이
 *   ③ service_role 키(RLS 를 통째로 우회하는 마스터 키)
 */
function blockLeakedSecrets(mode: string): Plugin {
  return {
    name: 'block-leaked-secrets',
    // 빌드뿐 아니라 개발 서버에서도 본다. 개발 중에 넣어 두고 잊는 게 제일 흔하다
    config() {
      const env = loadEnv(mode, process.cwd(), 'VITE_')
      const bad: string[] = []

      for (const [name, value] of Object.entries(env)) {
        if (name === 'VITE_SUPABASE_ANON_KEY') continue // 원래 브라우저에 들어가는 값

        if (/KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL/i.test(name)) {
          bad.push(`${name} — 이름부터 열쇠입니다. VITE_ 가 붙으면 화면 소스에 실립니다`)
          continue
        }
        if (/^sk-|^sk_|service_role/.test(String(value))) {
          bad.push(`${name} — 값이 열쇠 모양입니다 (sk-… 또는 service_role)`)
        }
      }

      if (bad.length > 0) {
        throw new Error(
          [
            '',
            '🔴 화면에 실리면 안 되는 값이 frontend/.env.local 에 있습니다.',
            '',
            ...bad.map((b) => `   · ${b}`),
            '',
            '   AI 열쇠는 화면이 아니라 Edge Function 에 넣습니다 —',
            '     1) supabase/.env 를 만들고 (supabase/.env.example 을 복사)',
            '     2) npx supabase secrets set --env-file supabase/.env',
            '',
            '   위 줄을 frontend/.env.local 에서 지우면 다시 진행됩니다.',
            '',
          ].join('\n'),
        )
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [blockLeakedSecrets(mode), react(), tailwindcss()],
  server: { port: 5173 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
}))
