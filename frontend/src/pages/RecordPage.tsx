import Stage from '../components/Stage'

export default function RecordPage() {
  return (
    <Stage
      stage={4}
      title="기록"
      items={[
        '업무일지 4단 — 오늘 진행한 업무(자동 수집) / 이슈·막힌 것 / 내일 할 일 / 메모',
        '주간·월간·연간 리포트 — 5단계. 확정하면 스냅샷으로 굳어 나중에 안 변합니다',
        '회의록 · 전화메모 — 7단계. 폰 녹음을 올리면 회의록이 됩니다',
      ]}
    />
  )
}
