import { describe, expect, it } from 'vitest'
import { storageMime } from '../api'

/*
  ══════════════════════════════════════════════════════════
  보관함이 받아 주는 형식 이름 — **같은 자리에서 두 번 걸렸다**
  ══════════════════════════════════════════════════════════
  보관함은 허용 목록과 **글자 그대로** 맞춰 본다 —
  audio/webm · audio/ogg · audio/mp4 · audio/mpeg · audio/wav.

  ① 2026-08-16 브라우저가 붙인 `;codecs=opus` 꼬리표 때문에 거절당했다.
     소리가 한 개도 안 올라갔는데 화면에는 회의록만 저장됐다.
     그때는 **꼬리표만 떼고** 이름 자체는 안 봤다.

  ② 2026-09-08 아이폰 녹음 파일이 `audio/x-m4a` 로 와서 또 거절당했다.
     「mime type audio/x-m4a is not supported」 — 통째 전사가 통째로 막혔다.

  두 번 겪었으니 시험으로 못 박는다.
  ══════════════════════════════════════════════════════════
*/
describe('storageMime — 보관함이 받아 주는 이름으로', () => {
  it('★ 아이폰 녹음(audio/x-m4a)이 거절당하지 않는다', () => {
    expect(storageMime('audio/x-m4a')).toBe('audio/mp4')
  })

  it('★ 브라우저가 붙인 꼬리표를 뗀다', () => {
    expect(storageMime('audio/webm;codecs=opus')).toBe('audio/webm')
    expect(storageMime('audio/mp4; codecs="mp4a.40.2"')).toBe('audio/mp4')
  })

  it('m4a · aac · mp4 계열은 전부 audio/mp4 로 모은다', () => {
    expect(storageMime('audio/m4a')).toBe('audio/mp4')
    expect(storageMime('audio/aac')).toBe('audio/mp4')
    expect(storageMime('audio/mp4')).toBe('audio/mp4')
    expect(storageMime('AUDIO/X-M4A')).toBe('audio/mp4')
  })

  it('나머지도 목록 안의 이름으로 간다', () => {
    expect(storageMime('audio/ogg')).toBe('audio/ogg')
    expect(storageMime('audio/wav')).toBe('audio/wav')
    expect(storageMime('audio/x-wav')).toBe('audio/wav')
    expect(storageMime('audio/mpeg')).toBe('audio/mpeg')
    expect(storageMime('audio/mp3')).toBe('audio/mpeg')
  })

  /*
    ★ 처음 보는 이름을 그대로 올리면 거절당한다.
    거절당하는 것보다 **기본값으로 올리는 편이 낫다** — 소리를 잃지 않는다.
  */
  it('★ 처음 보는 이름이면 기본값으로 — 거절당하는 것보다 낫다', () => {
    expect(storageMime('audio/처음보는형식')).toBe('audio/webm')
    expect(storageMime('audio/처음보는형식', 'audio/mp4')).toBe('audio/mp4')
  })

  it('비어 있어도 죽지 않는다', () => {
    expect(storageMime('')).toBe('audio/webm')
    expect(storageMime(undefined)).toBe('audio/webm')
    expect(storageMime(undefined, 'audio/mp4')).toBe('audio/mp4')
  })
})
