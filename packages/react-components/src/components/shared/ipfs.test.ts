import { describe, expect, it } from 'vitest'
import { linkifyIpfs } from './ipfs'

describe('linkifyIpfs', () => {
  it('returns undefined for undefined input', () => {
    expect(linkifyIpfs(undefined)).toBeUndefined()
  })

  it('leaves non-ipfs links untouched', () => {
    expect(linkifyIpfs('https://example.org/x.png')).toBe('https://example.org/x.png')
  })

  it('rewrites ipfs:// links to the default gateway', () => {
    expect(linkifyIpfs('ipfs://QmHash')).toBe('https://infura-ipfs.io/ipfs/QmHash')
  })

  it('honours a custom gateway', () => {
    expect(linkifyIpfs('ipfs://QmHash', 'https://my.gw/ipfs/')).toBe('https://my.gw/ipfs/QmHash')
  })
})
