import { Field, PillButton, Select, TextArea, TextInput } from '../../components/Field'
import type { MinutesDoc } from '../../domain/minutes'

/**
 * 회의록 양식을 고치는 화면.
 *
 * ── 왜 결정사항과 Action Item 을 따로 두나 ───────────────
 * 회의록의 값어치는 「무엇을 이야기했나」가 아니라
 * **「무엇을 결정했고, 누가 언제까지 무엇을 하는가」**에 있다.
 * 한 칸에 섞어 적으면 나중에 그걸 찾으려고 회의록을 다시 읽어야 한다.
 *
 * Action Item 은 여기서 **인박스로 넘어가 업무가 된다.**
 * 회의록이 기록으로 끝나지 않고 일로 이어지는 자리다.
 *
 * ⚠️ 이 화면은 **고치는 자리**다. 읽기 좋은 글로 내보내는 것은
 *    `domain/minutes.ts` 의 minutesToText 가 따로 한다.
 */
export default function MinutesForm({
  value,
  onChange,
  areas = [],
}: {
  value: MinutesDoc
  onChange: (next: MinutesDoc) => void
  /** 「기준 › 설정 › 업무영역」 목록. 비어 있으면 분류 칸을 숨긴다 */
  areas?: string[]
}) {
  const set = <K extends keyof MinutesDoc>(k: K, v: MinutesDoc[K]) =>
    onChange({ ...value, [k]: v })

  /** 줄 목록을 여러 줄 글로 주고받는다 — 사람은 줄 단위로 생각한다 */
  const lines = (arr: string[]) => arr.join('\n')
  const toLines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)

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
    <div className="space-y-4">
      {areas.length === 0 && (
        <p className="text-caption text-ink-mute leading-relaxed">
          💡 <strong className="font-semibold">기준 › 설정 › 업무영역</strong>에 영역을 등록하시면
          결정사항·Action Item 에 분류를 붙일 수 있습니다. 그 분류는 인박스를 거쳐{' '}
          <strong className="font-semibold">업무의 영역으로 이어집니다.</strong>
        </p>
      )}

      <Field label="2. 회의 목적" hint="회의를 통해 확인하거나 결정해야 하는 사항">
        <TextArea
          rows={2}
          value={lines(value.purpose)}
          onChange={(e) => set('purpose', toLines(e.target.value))}
        />
      </Field>

      <Field label="3. 주요 안건" hint="한 줄에 하나씩">
        <TextArea
          rows={3}
          value={lines(value.agenda)}
          onChange={(e) => set('agenda', toLines(e.target.value))}
        />
      </Field>

      {/* ── 4. 안건별 논의 ─────────────────────────────── */}
      <div>
        <p className="text-caption text-ink-soft mb-1.5">4. 안건별 논의 내용</p>
        {value.discussions.length === 0 ? (
          <p className="text-caption text-ink-mute">없음</p>
        ) : (
          <ul className="space-y-2">
            {value.discussions.map((d, i) => (
              <li
                key={i}
                className={
                  areas.length > 0
                    ? 'grid grid-cols-1 sm:grid-cols-[1fr_2fr_1fr_110px] gap-2'
                    : 'grid grid-cols-1 sm:grid-cols-[1fr_2fr_1fr] gap-2'
                }
              >
                <TextInput
                  value={d.topic}
                  placeholder="안건"
                  onChange={(e) =>
                    set(
                      'discussions',
                      value.discussions.map((x, j) =>
                        j === i ? { ...x, topic: e.target.value } : x,
                      ),
                    )
                  }
                />
                <TextInput
                  value={d.points}
                  placeholder="주요 논의"
                  onChange={(e) =>
                    set(
                      'discussions',
                      value.discussions.map((x, j) =>
                        j === i ? { ...x, points: e.target.value } : x,
                      ),
                    )
                  }
                />
                <TextInput
                  value={d.result}
                  placeholder="결과"
                  onChange={(e) =>
                    set(
                      'discussions',
                      value.discussions.map((x, j) =>
                        j === i ? { ...x, result: e.target.value } : x,
                      ),
                    )
                  }
                />
                <AreaPick
                  value={d.area}
                  onPick={(a) =>
                    set(
                      'discussions',
                      value.discussions.map((x, j) => (j === i ? { ...x, area: a } : x)),
                    )
                  }
                />
              </li>
            ))}
          </ul>
        )}
        <PillButton
          type="button"
          variant="ghost"
          className="mt-2"
          onClick={() =>
            set('discussions', [
              ...value.discussions,
              { topic: '', points: '', result: '', area: '' },
            ])
          }
        >
          ＋ 논의 줄
        </PillButton>
      </div>

      {/* ── 5. 결정사항 ────────────────────────────────── */}
      <div>
        <p className="text-caption text-ink-soft mb-1.5">
          5. 결정사항 <span className="text-ink-mute">— 최종적으로 결정된 내용</span>
        </p>
        {value.decisions.length === 0 ? (
          <p className="text-caption text-ink-mute">없음</p>
        ) : (
          <ul className="space-y-2">
            {value.decisions.map((d, i) => (
              <li key={i} className="flex flex-wrap items-start gap-2">
                <span className="text-caption text-ink-mute w-5 shrink-0 pt-2.5">{i + 1}</span>
                <div
                  className={
                    areas.length > 0
                      ? 'grid grid-cols-1 sm:grid-cols-[2fr_1fr_110px] gap-2 flex-1 min-w-0'
                      : 'grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-2 flex-1 min-w-0'
                  }
                >
                  <TextInput
                    value={d.text}
                    placeholder="결정 내용"
                    onChange={(e) =>
                      set(
                        'decisions',
                        value.decisions.map((x, j) =>
                          j === i ? { ...x, text: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <TextInput
                    value={d.note}
                    placeholder="비고 (근거 · 조건)"
                    onChange={(e) =>
                      set(
                        'decisions',
                        value.decisions.map((x, j) =>
                          j === i ? { ...x, note: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <AreaPick
                    value={d.area}
                    onPick={(a) =>
                      set(
                        'decisions',
                        value.decisions.map((x, j) => (j === i ? { ...x, area: a } : x)),
                      )
                    }
                  />
                </div>
                <button
                  type="button"
                  onClick={() => set('decisions', value.decisions.filter((_, j) => j !== i))}
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
            set('decisions', [...value.decisions, { text: '', note: '', area: '' }])
          }
        >
          ＋ 결정사항
        </PillButton>
      </div>

      {/* ── 6. Action Item ─────────────────────────────── */}
      <div>
        <p className="text-caption text-ink-soft mb-1.5">
          6. Action Item{' '}
          <span className="text-ink-mute">
            — 해야 할 업무 / 담당자 / 완료기한{areas.length > 0 && ' / 분류'}
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
                      ? 'grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_110px] gap-2 flex-1 min-w-0'
                      : 'grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr] gap-2 flex-1 min-w-0'
                  }
                >
                  <TextInput
                    value={a.text}
                    placeholder="해야 할 일"
                    onChange={(e) =>
                      set(
                        'actions',
                        value.actions.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)),
                      )
                    }
                  />
                  <TextInput
                    value={a.owner}
                    placeholder="담당자"
                    onChange={(e) =>
                      set(
                        'actions',
                        value.actions.map((x, j) => (j === i ? { ...x, owner: e.target.value } : x)),
                      )
                    }
                  />
                  <TextInput
                    value={a.due}
                    placeholder="완료기한"
                    onChange={(e) =>
                      set(
                        'actions',
                        value.actions.map((x, j) => (j === i ? { ...x, due: e.target.value } : x)),
                      )
                    }
                  />
                  <AreaPick
                    value={a.area}
                    onPick={(picked) =>
                      set(
                        'actions',
                        value.actions.map((x, j) => (j === i ? { ...x, area: picked } : x)),
                      )
                    }
                  />
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
              { text: '', owner: '', due: '', status: '예정', area: '' },
            ])
          }
        >
          ＋ Action Item
        </PillButton>
      </div>

      <Field label="7. 미결 · 추가 확인사항" hint="한 줄에 하나씩">
        <TextArea
          rows={2}
          value={lines(value.pending)}
          onChange={(e) => set('pending', toLines(e.target.value))}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-3">
        <Field label="8. 다음 회의 예정일">
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

      {value.checks.length > 0 && (
        <div>
          <p className="text-caption text-ink-soft mb-1.5">
            확인 필요 <span className="text-ink-mute">— 자동 변환 과정에서 오인식이 의심되는 부분</span>
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
