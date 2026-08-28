import { Field, PillButton, Select, TextArea, TextInput } from '../../components/Field'
import {
  CONFIRM_NOTICE,
  CONFIRM_STATEMENT,
  EMPTY_ITEM,
  attendeesToConfirms,
} from '../../domain/minutes'
import type { MinutesDoc } from '../../domain/minutes'

/**
 * 회의록 양식을 고치는 화면. **회사에서 쓰는 서식**을 그대로 옮겼다.
 *
 *   기본정보 → 안건별(현재상황·논의내용·결론·조치사항) → 조치사항 정리
 *   → 미결 → 다음 회의 점검 → 참석자 확인
 *
 * ── 왜 안건별로 묶었나 ───────────────────────────────────
 * 전에는 「논의」·「결정」·「할 일」이 각각 전체 목록이었다. 한 안건을 되짚으려면
 * 세 목록을 오가야 했다. 안건 카드 하나에 네 칸을 담으면
 * *"그 건이 어떻게 됐더라"* 의 답이 **한 덩어리로** 보인다.
 *
 * ── 그래도 결론과 조치사항은 가른다 ──────────────────────
 * 「A를 도입한다」는 결론, 「견적 3곳 비교 · 담당 · 8/21」은 조치사항이다.
 * 조치사항은 여기서 **인박스로 넘어가 업무가 된다.**
 * 회의록이 기록으로 끝나지 않고 일로 이어지는 자리다.
 *
 * ⚠️ 이 화면은 **고치는 자리**다. 읽기 좋은 글로 내보내는 것은
 *    `domain/minutes.ts` 의 minutesToText 와 `printMinutes.ts` 가 따로 한다.
 */
export default function MinutesForm({
  value,
  onChange,
  areas = [],
  attendees = '',
}: {
  value: MinutesDoc
  onChange: (next: MinutesDoc) => void
  /** 「기준 › 설정 › 업무영역」 목록. 비어 있으면 분류 칸을 숨긴다 */
  areas?: string[]
  /** 회의 기본정보의 참석자 칸. 확인란을 채울 때 쓴다 */
  attendees?: string
}) {
  const set = <K extends keyof MinutesDoc>(k: K, v: MinutesDoc[K]) =>
    onChange({ ...value, [k]: v })

  /** 줄 목록을 여러 줄 글로 주고받는다 — 사람은 줄 단위로 생각한다 */
  const lines = (arr: string[]) => arr.join('\n')
  const toLines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)

  const patchItem = (i: number, patch: Partial<MinutesDoc['items'][number]>) =>
    set('items', value.items.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const patchAction = (i: number, patch: Partial<MinutesDoc['actions'][number]>) =>
    set('actions', value.actions.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  /**
   * 분류 고르는 칸.
   *
   * 업무영역이 하나도 등록돼 있지 않으면 **아예 그리지 않는다** —
   * 고를 것이 없는 빈 칸은 화면만 복잡하게 만든다.
   */
  const AreaPick = ({ value: v, onPick }: { value: string; onPick: (a: string) => void }) =>
    areas.length === 0 ? null : (
      <Select value={v} onChange={(e) => onPick(e.target.value)}>
        <option value="">분류</option>
        {areas.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
        {v && !areas.includes(v) && <option value={v}>{v} (목록에 없음)</option>}
      </Select>
    )

  return (
    <div className="space-y-5">
      {areas.length === 0 && (
        <p className="text-caption text-ink-mute leading-relaxed">
          💡 <strong className="font-semibold">기준 › 설정 › 업무영역</strong>에 영역을 등록하시면
          안건·조치사항에 분류를 붙일 수 있습니다. 그 분류는 인박스를 거쳐{' '}
          <strong className="font-semibold">업무의 영역으로 이어집니다.</strong>
        </p>
      )}

      {/* ── 1. 기본정보에 딸린 두 칸 ────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-3">
        <Field label="회사 · 부서" hint="회의록 맨 위에 찍힙니다">
          <TextInput
            value={value.orgLine}
            placeholder="예: 주식회사 ○○ · 경영지원팀"
            onChange={(e) => set('orgLine', e.target.value)}
          />
        </Field>
        <Field label="작성일자" hint="회의한 날과 다를 수 있습니다">
          <TextInput
            value={value.writtenOn}
            placeholder="예: 2026. 8. 19."
            onChange={(e) => set('writtenOn', e.target.value)}
          />
        </Field>
      </div>

      <Field label="안건 목록" hint="기본정보 칸에 「1. … 2. …」로 들어갑니다. 한 줄에 하나">
        <TextArea
          rows={3}
          value={lines(value.agenda)}
          onChange={(e) => set('agenda', toLines(e.target.value))}
        />
      </Field>

      <Field label="회의 목적" hint="회의를 통해 확인하거나 결정해야 하는 사항">
        <TextArea
          rows={2}
          value={lines(value.purpose)}
          onChange={(e) => set('purpose', toLines(e.target.value))}
        />
      </Field>

      {/* ── 2. 안건별 본문 ──────────────────────────────── */}
      <div>
        <p className="text-caption text-ink-soft mb-1.5">
          안건별 논의 <span className="text-ink-mute">— 현재상황 · 논의내용 · 결론 · 조치사항</span>
        </p>
        {value.items.length === 0 ? (
          <p className="text-caption text-ink-mute">없음</p>
        ) : (
          <ul className="space-y-3">
            {value.items.map((it, i) => (
              <li key={i} className="border border-hairline rounded-[18px] p-4">
                <div className="flex flex-wrap items-start gap-2">
                  <span className="text-caption text-ink-mute shrink-0 pt-2.5">안건{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <TextInput
                      value={it.title}
                      placeholder="안건 제목"
                      onChange={(e) => patchItem(i, { title: e.target.value })}
                    />
                  </div>
                  <AreaPick value={it.area} onPick={(a) => patchItem(i, { area: a })} />
                  <button
                    type="button"
                    onClick={() => set('items', value.items.filter((_, j) => j !== i))}
                    className="text-caption text-ink-mute hover:text-alert pt-2.5"
                  >
                    삭제
                  </button>
                </div>

                <div className="mt-3 space-y-2.5">
                  <Field label="■ 현재상황" hint="회의 전에 이미 있던 사실">
                    <TextArea
                      rows={2}
                      value={it.situation}
                      onChange={(e) => patchItem(i, { situation: e.target.value })}
                    />
                  </Field>
                  <Field label="■ 논의내용">
                    <TextArea
                      rows={3}
                      value={it.discussion}
                      onChange={(e) => patchItem(i, { discussion: e.target.value })}
                    />
                  </Field>
                  <Field label="■ 결론" hint="정해진 내용. 행동은 아래 조치사항으로">
                    <TextArea
                      rows={2}
                      value={it.conclusion}
                      onChange={(e) => patchItem(i, { conclusion: e.target.value })}
                    />
                  </Field>
                  <Field label="■ 조치사항" hint="한 줄 요약. 담당·기한은 아래 정리 표에">
                    <TextArea
                      rows={2}
                      value={it.action}
                      onChange={(e) => patchItem(i, { action: e.target.value })}
                    />
                  </Field>
                </div>
              </li>
            ))}
          </ul>
        )}
        <PillButton
          type="button"
          variant="ghost"
          className="mt-2"
          onClick={() => set('items', [...value.items, { ...EMPTY_ITEM }])}
        >
          ＋ 안건
        </PillButton>
      </div>

      {/* ── 3. 조치사항 정리 ────────────────────────────── */}
      <div>
        <p className="text-caption text-ink-soft mb-1.5">
          조치사항 정리{' '}
          <span className="text-ink-mute">
            — 조치 내용 / 담당 / 마감기한 / 비고{areas.length > 0 && ' / 분류'}
          </span>
        </p>
        {value.actions.length === 0 ? (
          <p className="text-caption text-ink-mute">없음</p>
        ) : (
          <ul className="space-y-2">
            {value.actions.map((a, i) => (
              <li key={i} className="flex flex-wrap items-start gap-2">
                <span className="text-caption text-ink-mute w-5 shrink-0 pt-2.5">{i + 1}</span>
                <div
                  className={
                    areas.length > 0
                      ? 'grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_1fr_110px] gap-2 flex-1 min-w-0'
                      : 'grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_1fr] gap-2 flex-1 min-w-0'
                  }
                >
                  <TextInput
                    value={a.text}
                    placeholder="조치 내용"
                    onChange={(e) => patchAction(i, { text: e.target.value })}
                  />
                  <TextInput
                    value={a.owner}
                    placeholder="담당"
                    onChange={(e) => patchAction(i, { owner: e.target.value })}
                  />
                  <TextInput
                    value={a.due}
                    placeholder="마감기한"
                    onChange={(e) => patchAction(i, { due: e.target.value })}
                  />
                  <TextInput
                    value={a.note}
                    placeholder="비고"
                    onChange={(e) => patchAction(i, { note: e.target.value })}
                  />
                  <AreaPick value={a.area} onPick={(picked) => patchAction(i, { area: picked })} />
                </div>
                <button
                  type="button"
                  onClick={() => set('actions', value.actions.filter((_, j) => j !== i))}
                  className="text-caption text-ink-mute hover:text-alert pt-2.5"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
        <PillButton
          type="button"
          variant="ghost"
          className="mt-2"
          onClick={() =>
            set('actions', [
              ...value.actions,
              { text: '', owner: '', due: '', note: '', status: '예정', area: '' },
            ])
          }
        >
          ＋ 조치사항
        </PillButton>
      </div>

      <Field label="미결 · 추가 확인사항" hint="한 줄에 하나씩">
        <TextArea
          rows={2}
          value={lines(value.pending)}
          onChange={(e) => set('pending', toLines(e.target.value))}
        />
      </Field>

      {/* ── 4. 다음 회의 ────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-3">
        <Field label="다음 회의 예정일">
          <TextInput
            value={value.next.date}
            placeholder="예: 8/25"
            onChange={(e) => set('next', { ...value.next, date: e.target.value })}
          />
        </Field>
        <Field label="다음 회의 주요 안건">
          <TextInput
            value={value.next.agenda}
            onChange={(e) => set('next', { ...value.next, agenda: e.target.value })}
          />
        </Field>
      </div>

      <Field label="다음 회의 주요 점검 사항" hint="한 줄에 하나씩">
        <TextArea
          rows={3}
          value={lines(value.nextChecks)}
          onChange={(e) => set('nextChecks', toLines(e.target.value))}
        />
      </Field>

      {/* ── 5. 참석자 확인란 ────────────────────────────── */}
      <div>
        <p className="text-caption text-ink-soft mb-1.5">
          참석자 확인 <span className="text-ink-mute">— 회신을 받고 나서 바꾸는 칸입니다</span>
        </p>
        <p className="text-caption text-ink-mute leading-relaxed mb-2">{CONFIRM_STATEMENT}</p>

        {value.confirms.length === 0 ? (
          <p className="text-caption text-ink-mute">
            아직 없습니다. 참석자를 적으면 아래 버튼으로 확인란을 만듭니다.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {value.confirms.map((c, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-0 max-w-[280px]">
                  <TextInput
                    value={c.name}
                    placeholder="역할 · 직책"
                    onChange={(e) =>
                      set(
                        'confirms',
                        value.confirms.map((x, j) =>
                          j === i ? { ...x, name: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </div>
                <label className="flex items-center gap-1.5 text-caption text-ink-soft">
                  <input
                    type="checkbox"
                    checked={c.confirmed}
                    onChange={(e) =>
                      set(
                        'confirms',
                        value.confirms.map((x, j) =>
                          j === i ? { ...x, confirmed: e.target.checked } : x,
                        ),
                      )
                    }
                  />
                  {c.confirmed ? '확인' : '미확인'}
                </label>
                <button
                  type="button"
                  onClick={() => set('confirms', value.confirms.filter((_, j) => j !== i))}
                  className="text-caption text-ink-mute hover:text-alert"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2 mt-2">
          <PillButton
            type="button"
            variant="ghost"
            onClick={() => set('confirms', attendeesToConfirms(attendees, value.confirms))}
            disabled={!attendees.trim()}
          >
            참석자에서 가져오기
          </PillButton>
          <PillButton
            type="button"
            variant="ghost"
            onClick={() => set('confirms', [...value.confirms, { name: '', confirmed: false }])}
          >
            ＋ 한 줄
          </PillButton>
        </div>

        <p className="text-caption text-ink-mute leading-relaxed mt-2">{CONFIRM_NOTICE}</p>
      </div>

      {value.checks.length > 0 && (
        <div>
          <p className="text-caption text-ink-soft mb-1.5">
            확인 필요{' '}
            <span className="text-ink-mute">— 자동 변환 과정에서 오인식이 의심되는 부분</span>
          </p>
          <ul className="space-y-1">
            {value.checks.map((c, i) => (
              <li key={i} className="text-body text-ink-soft leading-relaxed">
                · {c}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
