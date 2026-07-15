import type { QuestionStatus } from '@vocdoni/api-types'
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeProcess, renderWithComponents } from '../../test-utils'

const state = vi.hoisted(() => ({
  election: null as ReturnType<typeof makeProcess> | null,
  status: null as QuestionStatus | null,
}))
vi.mock('@vocdoni/react-providers', () => ({ useElection: () => state }))

import { ElectionSchedule } from './Schedule'

const Slot = ({ text }: any) => <p data-testid="sched">{text}</p>
const slots = { components: { ElectionSchedule: Slot } }

describe('ElectionSchedule', () => {
  it('renders nothing without an election', () => {
    state.election = null
    state.status = null
    const { container } = renderWithComponents(<ElectionSchedule />, slots)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when dates are missing', () => {
    state.election = makeProcess({ startDate: '', endDate: '' })
    state.status = 'ONGOING'
    const { container } = renderWithComponents(<ElectionSchedule />, slots)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the from→to range by default', () => {
    state.election = makeProcess()
    state.status = 'ONGOING'
    renderWithComponents(<ElectionSchedule />, slots)
    expect(screen.getByTestId('sched')).toHaveTextContent('Voting from')
  })

  it('shows an "Ended" remaining label for an ended election', () => {
    state.election = makeProcess({
      startDate: '2020-01-01T00:00:00Z',
      endDate: '2020-02-01T00:00:00Z',
    })
    state.status = 'ENDED'
    renderWithComponents(<ElectionSchedule showRemaining />, slots)
    expect(screen.getByTestId('sched')).toHaveTextContent('Ended')
  })
})
