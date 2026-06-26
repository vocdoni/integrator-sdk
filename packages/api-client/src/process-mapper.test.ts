import { describe, expect, it } from 'vitest'
import { mapProcessToElection, type ProcessResponse } from './process-mapper'

const base: ProcessResponse = {
  id: '6a3cfc6b3af4e390f5f79291',
  address: '6be21a5a9dc01036097ea184999095aed31735e7264a19652130030800000001',
  chainId: 'vocdoni/DEV/36',
  status: 'READY',
  orgAdress: '0xorg',
  metadata: { title: 'Merged title', description: 'Merged description' },
  electionParams: {
    title: { default: 'Params title' },
    description: { default: 'Params description' },
    startDate: '2024-01-01T00:00:00Z',
    endDate: '2024-12-31T23:59:59Z',
    questions: [{ title: 'Q1', choices: [{ title: 'A', value: 0 }] }],
    voteType: {
      maxCount: 1,
      maxValue: 1,
      maxVoteOverwrites: 0,
      costExponent: 1,
      uniqueChoices: false,
      costFromWeight: false,
    },
    electionType: { interruptible: true, secretUntilTheEnd: false, anonymous: false },
    maxCensusSize: 100,
  },
  census: {
    id: 'census-1',
    type: 'csp',
    weighted: false,
    size: 10,
    published: { uri: 'https://example.org/census-1', root: '0xroot' },
    authFields: ['memberNumber'],
    twoFaFields: ['phone'],
  },
}

describe('mapProcessToElection', () => {
  it('keeps the mongo id and surfaces the vochain id as address + chainId', () => {
    const e = mapProcessToElection(base)
    expect(e.id).toBe(base.id)
    expect(e.address).toBe(base.address)
    expect(e.chainId).toBe('vocdoni/DEV/36')
    expect(e.status).toBe('READY')
  })

  it('maps the election definition out of electionParams', () => {
    const e = mapProcessToElection(base)
    expect(e.startDate).toBe('2024-01-01T00:00:00Z')
    expect(e.endDate).toBe('2024-12-31T23:59:59Z')
    expect(e.questions).toHaveLength(1)
    expect(e.questions[0].choices[0].value).toBe(0)
    expect(e.voteType.maxCount).toBe(1)
    expect(e.electionType.secretUntilTheEnd).toBe(false)
  })

  it('prefers metadata.title, falling back to electionParams.title.default', () => {
    expect(mapProcessToElection(base).title).toBe('Merged title')

    const noMeta = mapProcessToElection({ ...base, metadata: undefined })
    expect(noMeta.title).toBe('Params title')
    expect(noMeta.description).toBe('Params description')
  })

  it('maps the API org typo (orgAdress) onto organizationId', () => {
    expect(mapProcessToElection(base).organizationId).toBe('0xorg')
  })

  it('defaults voteCount/finalResults when absent', () => {
    const e = mapProcessToElection(base)
    expect(e.voteCount).toBe(0)
    expect(e.finalResults).toBe(false)
  })

  it('flattens census auth fields, taking uri from published.uri', () => {
    const e = mapProcessToElection(base)
    expect(e.census?.type).toBe('csp')
    expect(e.census?.weighted).toBe(false)
    expect(e.census?.authFields).toEqual(['memberNumber'])
    expect(e.census?.twoFaFields).toEqual(['phone'])
    expect(e.census?.uri).toBe('https://example.org/census-1')
  })

  it('leaves census undefined when the process has none', () => {
    expect(mapProcessToElection({ ...base, census: undefined }).census).toBeUndefined()
  })

  it('surfaces publicKeys (encrypted elections) as encryptionPublicKeys', () => {
    const keys = [{ index: 1, key: 'e34968e44589b4cdfda2365de5f9404b86fcc88ed015bea3f8b29975d958306e' }]
    const e = mapProcessToElection({ ...base, publicKeys: keys })
    expect(e.encryptionPublicKeys).toEqual(keys)
  })

  it('leaves encryptionPublicKeys undefined for non-encrypted processes', () => {
    expect(mapProcessToElection(base).encryptionPublicKeys).toBeUndefined()
  })

  it('throws when the process has no vochain address', () => {
    expect(() => mapProcessToElection({ ...base, address: undefined })).toThrow(/vochain address/)
  })

  it('falls back to default vote/election types when electionParams omits them', () => {
    const e = mapProcessToElection({ ...base, electionParams: undefined })
    expect(e.voteType).toEqual({
      maxCount: 1,
      maxValue: 1,
      maxVoteOverwrites: 0,
      costExponent: 1,
      uniqueChoices: false,
      costFromWeight: false,
    })
    expect(e.electionType).toEqual({
      interruptible: true,
      secretUntilTheEnd: false,
      anonymous: false,
    })
  })
})
