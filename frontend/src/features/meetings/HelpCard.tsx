import { Card } from '../../components/ui'

/**
 * 접어 두는 안내 카드.
 *
 * ── 왜 접어 두나 ─────────────────────────────────────────
 * 안내는 **처음 한두 번만** 필요하다. 그런데 펼쳐 두면 매일 쓰는 사람에게는
 * 화면에서 가장 큰 덩어리가 된다 — 실제로 「받아쓰기 점검」이 「이 회의」만큼
 * 자리를 차지해 화면이 어수선해졌다.
 *
 * 그렇다고 없애면 **처음 쓰는 사람이 막힌다.** 그래서 제목 한 줄만 남기고 접는다.
 * 필요한 사람만 펴 보면 된다.
 *
 * 세 탭(실시간·전사문·녹음파일)이 **같은 자리에 같은 모양**으로 둔다 —
 * 탭을 옮겨 다녀도 「도움말은 저기 있다」가 유지되게.
 */
export default function HelpCard({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  return (
    <Card>
      <details open={defaultOpen}>
        <summary className="text-caption text-ink-mute cursor-pointer">
          <strong className="font-semibold">{title}</strong>
        </summary>
        <div className="mt-3 text-caption text-ink-soft leading-relaxed space-y-2">{children}</div>
      </details>
    </Card>
  )
}
