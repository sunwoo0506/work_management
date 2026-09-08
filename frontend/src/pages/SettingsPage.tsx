import { PageHeader } from '../components/ui'
import SettingsPanel from '../features/base/SettingsPanel'

/**
 * 설정 — **툴 자체를 손보는 자리.**
 *
 * ── 왜 「기준」에서 떼어냈나 (2026-09-08) ────────────────
 * 원래 기준 페이지의 네 번째 칸이었다. 그런데 「기준」에 있는 나머지 셋과
 * **성격이 다르다.**
 *
 *   지시사항 · 인수인계 · 연락처 → **일하다가 들춰 보는 자료**
 *   설정                        → **툴이 어떻게 동작할지 정하는 곳**
 *
 * 앞의 셋은 자주 열고, 설정은 어쩌다 한 번 연다. 그런데 한 페이지에 묶여
 * 있으면 **설정을 열려고 「기준」을 거쳐야 한다.** 어디 있는지도 잘 기억나지
 * 않는다 — 부장님이 AI 사용량을 찾다가 못 찾으신 자리이기도 하다.
 *
 * ⚠️ 처음에는 업무영역·사내 용어집도 여기 뒀는데 **같은 날 도로 기준으로
 *    옮겼다**(부장님 판단). 그 둘은 툴 설정이 아니라 **회사의 기준**이다 —
 *    업무를 어떻게 나누는지, 우리 회사 말이 무엇인지. 여기 남은 것은
 *    AI 사용량과 로그인, 즉 **툴을 손보는 것**뿐이다.
 *
 * ⚠️ 내용은 그대로다. **자리만 옮겼다** — SettingsPanel 은 손대지 않았다.
 */
export default function SettingsPage() {
  return (
    <div className="max-w-[1120px]">
      <PageHeader
        title="설정"
        description="이 툴이 어떻게 동작할지 정하는 곳입니다. AI 사용량 · 로그인."
      />
      <div className="mt-5">
        <SettingsPanel />
      </div>
    </div>
  )
}
