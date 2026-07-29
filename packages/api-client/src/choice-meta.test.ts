import type { VotingProcessQuestion, VotingProcessResponse } from '@vocdoni/api-types'
import { describe, expect, it } from 'vitest'
import { normalizeQuestionChoiceMeta } from './choice-meta'
import { normalizeVotingProcess } from './election-status'

/** A question with three choices (values 0..2) and an optional metadata bag. */
const question = (metadata?: Record<string, unknown>): VotingProcessQuestion =>
  ({
    id: 'q-0',
    status: 'ONGOING',
    choices: [
      { title: { default: 'With skin' }, value: 0 },
      { title: { default: 'Without skin' }, value: 1 },
      { title: { default: 'Undecided' }, value: 2 },
    ],
    metadata,
  }) as unknown as VotingProcessQuestion

const metaOf = (q: VotingProcessQuestion, value: number) =>
  q.choices.find((choice) => choice.value === value)?.meta

describe('normalizeQuestionChoiceMeta', () => {
  it('maps metadata.choices onto the matching choice, keyed by value', () => {
    const normalized = normalizeQuestionChoiceMeta(
      question({
        choices: [
          { value: 1, description: 'Peeled beforehand', image: 'https://cdn.example/b.jpeg' },
          { value: 0, image: 'https://cdn.example/a.jpeg' },
        ],
      }),
    )

    expect(metaOf(normalized, 0)).toEqual({ image: { default: 'https://cdn.example/a.jpeg' } })
    expect(metaOf(normalized, 1)).toEqual({
      description: 'Peeled beforehand',
      image: { default: 'https://cdn.example/b.jpeg' },
    })
    expect(metaOf(normalized, 2)).toBeUndefined()
  })

  it('normalizes a plain string image to { default }', () => {
    const normalized = normalizeQuestionChoiceMeta(
      question({ choices: [{ value: 0, image: 'https://cdn.example/a.jpeg' }] }),
    )
    expect(metaOf(normalized, 0)?.image).toEqual({ default: 'https://cdn.example/a.jpeg' })
  })

  it('passes an object image through, keeping default and thumbnail', () => {
    const normalized = normalizeQuestionChoiceMeta(
      question({
        choices: [
          { value: 0, image: { default: 'https://cdn.example/full.jpeg', thumbnail: 'https://cdn.example/t.jpeg' } },
        ],
      }),
    )
    expect(metaOf(normalized, 0)?.image).toEqual({
      default: 'https://cdn.example/full.jpeg',
      thumbnail: 'https://cdn.example/t.jpeg',
    })
  })

  it('leaves ipfs:// URLs untouched — the display layer resolves the gateway', () => {
    const normalized = normalizeQuestionChoiceMeta(
      question({ choices: [{ value: 0, image: 'ipfs://bafyfoo' }] }),
    )
    expect(metaOf(normalized, 0)?.image).toEqual({ default: 'ipfs://bafyfoo' })
  })

  it('keeps an empty description verbatim — the display layer drops it', () => {
    const normalized = normalizeQuestionChoiceMeta(
      question({ choices: [{ value: 0, description: '', image: 'https://cdn.example/a.jpeg' }] }),
    )
    expect(metaOf(normalized, 0)).toEqual({ description: '', image: { default: 'https://cdn.example/a.jpeg' } })
  })

  it('carries creator-defined keys through, alongside the recognized ones', () => {
    const normalized = normalizeQuestionChoiceMeta(
      question({
        choices: [{ value: 0, image: 'https://cdn.example/a.jpeg', color: 'red', badge: { label: 'new' } }],
      }),
    )
    expect(metaOf(normalized, 0)).toEqual({
      image: { default: 'https://cdn.example/a.jpeg' },
      color: 'red',
      badge: { label: 'new' },
    })
  })

  it('maps an entry carrying only creator-defined keys', () => {
    const normalized = normalizeQuestionChoiceMeta(question({ choices: [{ value: 0, color: 'red' }] }))
    expect(metaOf(normalized, 0)).toEqual({ color: 'red' })
  })

  it('never copies the value join key onto the meta', () => {
    const normalized = normalizeQuestionChoiceMeta(
      question({ choices: [{ value: 0, description: 'Peeled beforehand' }] }),
    )
    expect(metaOf(normalized, 0)).not.toHaveProperty('value')
  })

  it('drops a recognized key that is unusable, keeping the rest of the entry', () => {
    const normalized = normalizeQuestionChoiceMeta(
      question({ choices: [{ value: 0, description: 42, image: 42, color: 'red' }] }),
    )
    expect(metaOf(normalized, 0)).toEqual({ color: 'red' })
  })

  it('ignores metadata entries whose value matches no choice', () => {
    const normalized = normalizeQuestionChoiceMeta(
      question({ choices: [{ value: 7, description: 'Orphan', image: 'https://cdn.example/x.jpeg' }] }),
    )
    expect(normalized.choices.every((choice) => choice.meta === undefined)).toBe(true)
  })

  it('ignores entries with no usable value or no content at all', () => {
    const normalized = normalizeQuestionChoiceMeta(
      question({
        choices: [
          { value: '0', description: 'Wrong value type' },
          { value: 1 },
          { value: 2, image: 42 },
          null,
        ],
      }),
    )
    expect(normalized.choices.every((choice) => choice.meta === undefined)).toBe(true)
  })

  it('keeps the first entry when a value is duplicated', () => {
    const normalized = normalizeQuestionChoiceMeta(
      question({
        choices: [
          { value: 0, description: 'First' },
          { value: 0, description: 'Second' },
        ],
      }),
    )
    expect(metaOf(normalized, 0)).toEqual({ description: 'First' })
  })

  it('leaves choice.meta undefined when the question has no metadata.choices', () => {
    expect(normalizeQuestionChoiceMeta(question()).choices.every((c) => c.meta === undefined)).toBe(true)
    expect(normalizeQuestionChoiceMeta(question({})).choices.every((c) => c.meta === undefined)).toBe(true)
    expect(
      normalizeQuestionChoiceMeta(question({ choices: 'nope' })).choices.every((c) => c.meta === undefined),
    ).toBe(true)
  })

  it('returns the same question object when there is nothing to map', () => {
    const q = question()
    expect(normalizeQuestionChoiceMeta(q)).toBe(q)
  })

  it('is idempotent — re-normalizing an already-mapped question changes nothing', () => {
    const q = question({ choices: [{ value: 0, image: 'https://cdn.example/a.jpeg' }] })
    const once = normalizeQuestionChoiceMeta(q)
    expect(normalizeQuestionChoiceMeta(once)).toEqual(once)
  })
})

describe('normalizeVotingProcess (choice meta)', () => {
  const process = (questions: VotingProcessQuestion[]): VotingProcessResponse =>
    ({
      id: 'proc-1',
      orgAddress: '0000000000000000000000000000000000000001',
      title: { default: 'Test process' },
      startDate: '2024-01-01T00:00:00Z',
      endDate: '2024-12-31T23:59:59Z',
      published: true,
      census: {},
      questions,
    }) as VotingProcessResponse

  it('maps choice meta on the process read, per question', () => {
    const withMeta = question({ choices: [{ value: 0, image: 'https://cdn.example/a.jpeg' }] })
    const normalized = normalizeVotingProcess(process([withMeta, question()]))

    expect(metaOf(normalized.questions[0], 0)?.image).toEqual({ default: 'https://cdn.example/a.jpeg' })
    expect(normalized.questions[1].choices.every((c) => c.meta === undefined)).toBe(true)
  })

  it('still normalizes question statuses alongside the choice meta', () => {
    const q = question({ choices: [{ value: 0, description: 'Hi' }] })
    const normalized = normalizeVotingProcess(
      process([{ ...q, status: 'READY' as VotingProcessQuestion['status'] }]),
    )
    expect(normalized.questions[0].status).toBe('ONGOING')
    expect(metaOf(normalized.questions[0], 0)).toEqual({ description: 'Hi' })
  })
})
