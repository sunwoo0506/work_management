// deno-lint-ignore-file no-explicit-any
import { MissingKeyError, TranscribeError, num } from './types.ts'
import type { TranscribeInput, TranscribeResult, Transcriber } from './types.ts'

/**
 * OpenAI 받아쓰기 어댑터.
 *
 * 소리를 **파일 폼**으로 보낸다. 2026-08-19 까지 이 코드는 `transcribe/index.ts`
 * 안에 그대로 있었고, 모델을 고를 수 있게 하면서 이리로 옮겼다.
 * **동작은 하나도 바꾸지 않았다** — 옮기기만 했다.
 */

/**
 * 토막마다의 확신도를 **주는 모델과 안 주는 모델이 있다.**
 *
 * `whisper-1` 만 `verbose_json` 을 받는다. `gpt-transcribe` 계열에 그걸 달라고 하면
 * **400 으로 통째로 거절당한다.** 그래서 모델을 보고 형식을 바꾼다.
 *
 * ⚠️ 이 차이가 화면에도 영향을 준다 — 숫자가 없으면 지어낸 말을 거르는 그물이
 *    「낱말 목록」 한 겹만 남는다. 화면에서 그 사실을 사용자에게 알린다.
 */
function givesSegments(model: string): boolean {
  return model.startsWith('whisper')
}

/**
 * 화자를 갈라 주는 모델인가 (2026-09-08).
 *
 * OpenAI 쪽에서 이걸 하는 것은 **화자 구분 전용 모델 하나뿐**이다.
 * whisper 나 일반 gpt-transcribe 에 갈라 달라고 하면 그냥 무시되거나 거절당한다.
 */
function canDiarize(model: string): boolean {
  return model.includes('diarize')
}

export function createOpenAITranscriber(): Transcriber {
  return {
    name: 'openai',

    async run({ file, hint, model, diarize, speakers }: TranscribeInput): Promise<TranscribeResult> {
      const key = Deno.env.get('OPENAI_API_KEY')
      if (!key) {
        throw new MissingKeyError(
          'AI 열쇠(OPENAI_API_KEY)가 설정되지 않았습니다. Supabase > Edge Functions > Secrets 에 넣어 주세요.',
        )
      }

      const verbose = givesSegments(model)

      const out = new FormData()
      out.append('file', file, fileName(file))
      out.append('model', model)
      out.append('language', 'ko')

      /*
        ⚠️ **verbose_json 으로 받는다** (받는 모델일 때만).
        그냥 json 은 글만 오는데, 이건 **토막마다 「이게 정말 말이었나」를 숫자로** 같이 준다.

        재 봤더니 갈라지는 정도가 압도적이다 (2026-08-19) —
          무음(지어낸 말)  말없음확률 0.802
          사람 말          말없음확률 0.008
        100배 차이다. **낱말 목록과 달리 처음 보는 헛소리도 이걸로 잡힌다.**

        판단은 여기서 하지 않고 **화면 쪽 순수 계산에 맡긴다**(domain/hallucination.ts).
        여기는 Deno 로 돌아 시험을 못 붙이는 자리다 — 판단이 들어가면 아무도 못 고친다.
      */
      /*
        화자를 갈라 달라고 했고 그게 되는 모델이면 **전용 형식**으로 받는다.
        그러면 답이 「누가 말했나 + 무슨 말」 토막들로 온다.
      */
      const wantSpeakers = diarize === true && canDiarize(model)
      out.append(
        'response_format',
        wantSpeakers ? 'diarized_json' : verbose ? 'verbose_json' : 'json',
      )

      /*
        ★ 목소리를 미리 등록해 두면 **이름으로 적힌다** (2026-09-08).

        등록이 없으면 「A」·「B」 같은 글자로 나온다. 등록해 두면 그 자리에
        「대표이사」가 그대로 들어간다. 그러면 구간이 갈려도 **이름은 안 흔들린다** —
        번호와 달리 이름은 구간마다 새로 매겨지지 않기 때문이다.

        ⚠️ 4명까지다. 넘으면 거절당하므로 여기서 잘라 보낸다.
      */
      if (wantSpeakers && speakers && speakers.length > 0) {
        for (const sp of speakers.slice(0, 4)) {
          out.append('known_speaker_names[]', sp.name)
          out.append('known_speaker_references[]', sp.dataUrl)
        }
      }

      /*
        ⚠️ 「지어내기」를 최대한 줄인다 (2026-08-19).

        받아쓰기 모델은 유튜브 자막을 대량으로 보고 배웠다. 그래서 **소리가 흐릿한
        토막**을 받으면 빈 답 대신 자막에서 흔한 문장을 지어낸다 —
        「시청해주셔서 감사합니다」가 실제로 회의록에 들어왔다.

        temperature 는 **얼마나 과감하게 지어낼지**를 정하는 값이다. 0 이면
        들린 대로만 적으려 한다. 기본값이 0 이 아니라서 명시적으로 넣는다.

        ⚠️ **재 봤더니 이 문제는 못 막았다.** 무음 15초를 넣어 네 가지로 시험했는데
           (기본/0 × 힌트 있음/없음) **네 번 다 「시청해주셔서 감사합니다」가 나왔다.**
           그래도 남긴 이유는, 소리가 **흐릿하게 있는** 토막에서 답이 덜 흔들리기
           때문이다. 지어내기를 막는 것은 아래 ①③ 이 한다.

        막는 것은 세 겹인데 **무게가 다르다** —
          ① 말이 없는 토막은 **아예 안 보낸다** (useRecorder.ts)  ← 이게 결정적이다
          ② 여기서 답이 덜 흔들리게 한다                        ← 보조
          ③ 그래도 나온 것은 글에서 거른다 (domain/hallucination.ts) ← 마지막 그물
      */
      out.append('temperature', '0')

      /**
       * 사내 용어를 미리 알려 준다.
       *
       * 받아쓰기 모델은 「이런 말이 나올 것」이라는 힌트를 받으면 그 표기로 적는다.
       * 「타이백」이 아니라 「타이벡」으로 나오게 하는 자리다 (설계서 §5.8).
       */
      if (hint) out.append('prompt', hint)

      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: out,
      })

      if (!res.ok) throw new TranscribeError(res.status, await res.text())

      const body = await res.json()

      /*
        토막마다의 확신도를 **그대로 넘긴다.** 무엇을 버릴지는 화면이 정한다.
        이름을 우리 식으로 바꿔서 넘기는 이유 — 공급자를 갈아끼워도
        화면이 안 바뀌게 하기 위해서다 (CLAUDE.md, 어댑터 한 겹).
      */
      const segments = Array.isArray(body?.segments)
        ? body.segments.map((s: any) => ({
            text: String(s?.text ?? ''),
            noSpeechProb: num(s?.no_speech_prob),
            avgLogprob: num(s?.avg_logprob),
            compressionRatio: num(s?.compression_ratio),
          }))
        : []

      /*
        화자별로 온 답은 **「이름: 말」 줄로 묶어** 돌려준다.
        제미나이 쪽과 **같은 모양**으로 맞춘다 — 그래야 회의록을 만드는 쪽이
        어느 모델로 받아썼는지 몰라도 된다 (어댑터를 둔 이유).

        묶지 못하면 통짜 글로 되돌아간다. 화자 표시를 못 얻었다고
        받아쓴 글까지 잃으면 안 된다.
      */
      const whole = String(body?.text ?? '').trim()
      if (wantSpeakers) {
        const lines: string[] = []
        let who = ''
        let buf: string[] = []
        const flush = () => {
          if (buf.length === 0) return
          lines.push(`${who || '화자?'}: ${buf.join(' ').replace(/\s+/g, ' ').trim()}`)
          buf = []
        }
        for (const seg of body?.segments ?? []) {
          const text = String(seg?.text ?? '').trim()
          if (!text) continue
          const speaker = String(seg?.speaker ?? '')
          if (speaker !== who) {
            flush()
            who = speaker
          }
          buf.push(text)
        }
        flush()
        if (lines.length > 0) {
          return { text: lines.join('\n'), segments: [], model, diarized: true }
        }
      }

      return { text: whole, segments, model }
    },
  }
}

/**
 * 파일 이름을 만들어 붙인다.
 *
 * 받아쓰기 쪽이 **확장자를 보고 소리 형식을 판단한다.** 이름이 없거나
 * 확장자가 엉뚱하면 "지원하지 않는 형식"으로 거절당한다.
 * 폰마다 녹음 형식이 다르다 — 안드로이드는 webm, 아이폰은 mp4 계열이다.
 */
function fileName(file: File): string {
  const type = (file.type || '').toLowerCase()
  if (type.includes('mp4') || type.includes('m4a') || type.includes('aac')) return 'chunk.mp4'
  if (type.includes('ogg')) return 'chunk.ogg'
  if (type.includes('mpeg') || type.includes('mp3')) return 'chunk.mp3'
  if (type.includes('wav')) return 'chunk.wav'
  return 'chunk.webm'
}
