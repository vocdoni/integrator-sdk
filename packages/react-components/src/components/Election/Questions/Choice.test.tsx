import type { Choice } from '@vocdoni/api-types'
import { describe, expect, it } from 'vitest'
import { getQuestionChoiceMeta, hasExtendedChoiceMeta } from './Choice'

const choice = (meta?: Choice['meta']): Choice => ({ title: { default: 'With skin' }, value: 0, meta })

describe('getQuestionChoiceMeta', () => {
  it('reads the image and description the API client folded onto the choice', () => {
    const meta = getQuestionChoiceMeta(
      choice({ description: 'Peeled beforehand', image: { default: 'https://cdn.example/a.jpeg' } }),
    )
    expect(meta.description).toBe('Peeled beforehand')
    expect(meta.image?.default).toBe('https://cdn.example/a.jpeg')
  })

  it('keeps both image sizes when the stored entry carried a thumbnail', () => {
    const meta = getQuestionChoiceMeta(
      choice({ image: { default: 'https://cdn.example/full.jpeg', thumbnail: 'https://cdn.example/t.jpeg' } }),
    )
    expect(meta.image).toEqual({
      default: 'https://cdn.example/full.jpeg',
      thumbnail: 'https://cdn.example/t.jpeg',
    })
  })

  it('resolves ipfs:// URLs through the gateway', () => {
    const meta = getQuestionChoiceMeta(choice({ image: { default: 'ipfs://bafyfoo' } }))
    expect(meta.image?.default).toBe('https://infura-ipfs.io/ipfs/bafyfoo')
  })

  it('drops empty and whitespace-only strings', () => {
    const meta = getQuestionChoiceMeta(choice({ description: '', image: { default: '   ' } }))
    expect(meta.description).toBeUndefined()
    expect(meta.image).toBeUndefined()
  })

  it('returns an empty meta for a choice the client left untouched', () => {
    expect(getQuestionChoiceMeta(choice())).toEqual({ image: undefined, description: undefined })
  })
})

describe('hasExtendedChoiceMeta', () => {
  it('is true when the choice carries a description or any image', () => {
    expect(hasExtendedChoiceMeta(choice({ description: 'Peeled beforehand' }))).toBe(true)
    expect(hasExtendedChoiceMeta(choice({ image: { default: 'https://cdn.example/a.jpeg' } }))).toBe(true)
    expect(hasExtendedChoiceMeta(choice({ image: { thumbnail: 'https://cdn.example/t.jpeg' } }))).toBe(true)
  })

  it('is false for an empty description — an entry with nothing to show is not extended', () => {
    expect(hasExtendedChoiceMeta(choice({ description: '' }))).toBe(false)
    expect(hasExtendedChoiceMeta(choice({ description: '  ' }))).toBe(false)
  })

  it('is false for a choice with no meta at all', () => {
    expect(hasExtendedChoiceMeta(choice())).toBe(false)
  })
})
