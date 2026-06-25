import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeElection, renderWithComponents } from '../../test-utils'

const state = vi.hoisted(() => ({ election: null as ReturnType<typeof makeElection> | null }))
vi.mock('@vocdoni/react-providers', () => ({ useElection: () => state }))

// Imported after the mock is registered.
import { ElectionStatusBadge } from './StatusBadge'

const Slot = ({ tone, label }: { tone: string; label: string }) => (
  <span data-testid="badge">{`${tone}:${label}`}</span>
)

const slots = { components: { ElectionStatusBadge: Slot } }

describe('ElectionStatusBadge', () => {
  it.each([
    ['READY', 'success', 'Ongoing'],
    ['PAUSED', 'warning', 'Paused'],
    ['ENDED', 'warning', 'Ended'],
    ['CANCELED', 'danger', 'Canceled'],
  ] as const)('maps %s to tone %s with label "%s"', (status, tone, label) => {
    state.election = makeElection({ status })
    renderWithComponents(<ElectionStatusBadge />, slots)
    expect(screen.getByTestId('badge')).toHaveTextContent(`${tone}:${label}`)
  })

  it('uses the invalid label when the status is empty', () => {
    state.election = makeElection({ status: '' as never })
    renderWithComponents(<ElectionStatusBadge />, slots)
    expect(screen.getByTestId('badge')).toHaveTextContent('success:Invalid')
  })

  it('renders nothing when there is no election', () => {
    state.election = null
    const { container } = renderWithComponents(<ElectionStatusBadge />, slots)
    expect(container).toBeEmptyDOMElement()
  })
})
