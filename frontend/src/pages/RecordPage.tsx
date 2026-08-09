import Stage from '../components/Stage'

export default function RecordPage() {
  return (
    <Stage
      stage={4}
      title="기록"
      description="되돌아보는 것들이 모입니다. 연말에 여기 한 곳만 열면 되도록."
      items={[
        { text: '업무일지 4단 — 오늘 진행한 업무(자동 수집) · 이슈 · 내일 할 일 · 메모', stage: 4 },
        { text: '주간 · 월간 · 연간 리포트 — 확정하면 굳어서 나중에 안 변합니다', stage: 5 },
        { text: '회의록 · 전화메모 — 폰 녹음을 올리면 회의록이 됩니다', stage: 7 },
      ]}
    />
  )
}
