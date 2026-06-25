import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeElection, renderWithComponents } from '../../test-utils'

const state = vi.hoisted(() => ({ election: null as ReturnType<typeof makeElection> | null }))
vi.mock('@vocdoni/react-providers', () => ({ useElection: () => state }))

import { ElectionSchedule } from './Schedule'

const Slot = ({ text }: { text: string }) => <p data-testid="sched">{text}</p>
const slots = { components: { ElectionSchedule: Slot } }

describe('ElectionSchedule', () => {
  it('renders nothing without an election', () => {
    state.election = null
    const { container } = renderWithComponents(<ElectionSchedule />, slots)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when dates are missing', () => {
    state.election = makeElection({ startDate: '', endDate: '' })
    const { container } = renderWithComponents(<ElectionSchedule />, slots)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the from→to range by default', () => {
    state.election = makeElection({ status: 'READY' })
    renderWithComponents(<ElectionSchedule />, slots)
    expect(screen.getByTestId('sched')).toHaveTextContent('Voting from')
  })

  it('shows an "Ended" remaining label for an ended election', () => {
    state.election = makeElection({
      status: 'ENDED',
      startDate: '2020-01-01T00:00:00Z',
      endDate: '2020-02-01T00:00:00Z',
    })
    renderWithComponents(<ElectionSchedule showRemaining />, slots)
    expect(screen.getByTestId('sched')).toHaveTextContent('Ended')
  })
})
