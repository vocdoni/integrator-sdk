import { fixtures, makeClient } from './helpers'

// Runs against the default dev bundle (or INTEGRATION_BUNDLE_ID).
const suite = fixtures.bundleId ? describe : describe.skip

suite('bundle info (live data)', () => {
  it('returns the bundle with its id and process list', async () => {
    const bundle = await makeClient().bundle.get(fixtures.bundleId)
    expect(bundle.id).toBe(fixtures.bundleId)
    expect(Array.isArray(bundle.processes)).toBe(true)
    expect(bundle.processes).toContain(fixtures.processId)
  })

  it('exposes chainId — the field the vote signature depends on', async () => {
    const bundle = await makeClient().bundle.get(fixtures.bundleId)
    if (bundle.chainId == null) {
      console.warn(
        `[integration] bundle ${fixtures.bundleId} has no chainId — ` +
          'vote signing would fail. Backend field not live?',
      )
    }
    expect(bundle.chainId, 'bundle.chainId missing').toBeTruthy()
    expect(typeof bundle.chainId).toBe('string')
  })
})
