import type { QuestionStatus } from '@vocdoni/api-types'
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeProcess, renderWithComponents } from '../../test-utils'

const state = vi.hoisted(() => ({
  election: null as ReturnType<typeof makeProcess> | null,
  status: 'ONGOING' as QuestionStatus | null,
  isAbleToVote: false,
  hasVoted: false,
}))
vi.mock('@vocdoni/react-providers', () => ({ useElection: () => state }))

import { VoteButton } from './VoteButton'

const Slot = ({ disabled, label }: any) => (
  <button data-testid="vote" disabled={disabled}>
    {label}
  </button>
)
const slots = { components: { VoteButton: Slot } }

function setVoter(over: Partial<typeof state>) {
  Object.assign(state, { election: makeProcess(), status: 'ONGOING', isAbleToVote: false, hasVoted: false }, over)
}

describe('VoteButton', () => {
  it('is enabled and labelled "Vote" when the voter can vote on an ONGOING election', () => {
    setVoter({ isAbleToVote: true })
    renderWithComponents(<VoteButton />, slots)
    const btn = screen.getByTestId('vote')
    expect(btn).toBeEnabled()
    expect(btn).toHaveTextContent('Vote')
  })

  it('shows the update label once the voter has already voted', () => {
    setVoter({ isAbleToVote: true, hasVoted: true })
    renderWithComponents(<VoteButton />, slots)
    expect(screen.getByTestId('vote')).toHaveTextContent('Re-submit vote')
  })

  it('is disabled when the voter is not able to vote', () => {
    setVoter({ isAbleToVote: false })
    renderWithComponents(<VoteButton />, slots)
    expect(screen.getByTestId('vote')).toBeDisabled()
  })

  it('is disabled when the election is not ONGOING', () => {
    setVoter({ status: 'PAUSED', isAbleToVote: true })
    renderWithComponents(<VoteButton />, slots)
    expect(screen.getByTestId('vote')).toBeDisabled()
  })

  it('honours an external disabled prop even when otherwise votable', () => {
    setVoter({ isAbleToVote: true })
    renderWithComponents(<VoteButton disabled />, slots)
    expect(screen.getByTestId('vote')).toBeDisabled()
  })

  it('renders nothing without an election', () => {
    setVoter({ election: null })
    const { container } = renderWithComponents(<VoteButton />, slots)
    expect(container).toBeEmptyDOMElement()
  })
})
