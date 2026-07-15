import type { QuestionStatus } from '@vocdoni/api-types'
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeProcess, renderWithComponents } from '../../test-utils'

const state = vi.hoisted(() => ({
  election: null as ReturnType<typeof makeProcess> | null,
  status: null as QuestionStatus | null,
}))
vi.mock('@vocdoni/react-providers', () => ({ useElection: () => state }))

// Imported after the mock is registered.
import { ElectionStatusBadge } from './StatusBadge'

const Slot = ({ tone, label }: any) => <span data-testid="badge">{`${tone}:${label}`}</span>

const slots = { components: { ElectionStatusBadge: Slot } }

describe('ElectionStatusBadge', () => {
  it.each([
    ['ONGOING', 'success', 'Ongoing'],
    ['PAUSED', 'warning', 'Paused'],
    ['ENDED', 'warning', 'Ended'],
    ['CANCELED', 'danger', 'Canceled'],
  ] as const)('maps %s to tone %s with label "%s"', (status, tone, label) => {
    state.election = makeProcess()
    state.status = status
    renderWithComponents(<ElectionStatusBadge />, slots)
    expect(screen.getByTestId('badge')).toHaveTextContent(`${tone}:${label}`)
  })

  it('renders nothing when there is no status', () => {
    state.election = makeProcess()
    state.status = null
    const { container } = renderWithComponents(<ElectionStatusBadge />, slots)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when there is no election', () => {
    state.election = null
    state.status = null
    const { container } = renderWithComponents(<ElectionStatusBadge />, slots)
    expect(container).toBeEmptyDOMElement()
  })
})
