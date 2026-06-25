import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { makeElection } from '../../../test-utils'

// Election + a spy vote() come from the (mocked) providers; confirm() is forced true.
const state = vi.hoisted(() => ({
  election: null as ReturnType<typeof makeElection> | null,
  vote: vi.fn(),
  confirmResult: true,
}))
vi.mock('@vocdoni/react-providers', () => ({
  useElection: () => ({ election: state.election, vote: state.vote }),
}))
vi.mock('../../../confirm/useConfirm', () => ({
  useConfirm: () => ({ confirm: () => Promise.resolve(state.confirmResult) }),
}))

import { QuestionsFormProvider, useQuestionsForm } from './Form'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QuestionsFormProvider>{children}</QuestionsFormProvider>
)

function setup(election: ReturnType<typeof makeElection> | null, confirmResult = true) {
  state.election = election
  state.vote = vi.fn().mockResolvedValue('vote-id')
  state.confirmResult = confirmResult
  return renderHook(useQuestionsForm, { wrapper })
}

const twoQuestions = [
  { title: 'Q1', choices: [{ title: 'A', value: 0 }, { title: 'B', value: 1 }] },
  { title: 'Q2', choices: [{ title: 'A', value: 0 }, { title: 'B', value: 1 }] },
]

describe('QuestionsFormProvider vote payload', () => {
  it('single choice: maps each question field to an int array', async () => {
    const { result } = setup(makeElection({ questions: twoQuestions }))
    await result.current.vote({ '0': '1', '1': '0' })
    expect(state.vote).toHaveBeenCalledWith([1, 0])
  })

  it('multiple choice: takes the selected array from the last field', async () => {
    const { result } = setup(
      makeElection({
        questions: [twoQuestions[0]],
        voteType: {
          maxCount: 3,
          maxValue: 1,
          maxVoteOverwrites: 0,
          costExponent: 1,
          uniqueChoices: true,
          costFromWeight: false,
        },
      }),
    )
    await result.current.vote({ '0': ['2', '0'] })
    expect(state.vote).toHaveBeenCalledWith([2, 0])
  })

  it('approval (maxCount>1, not unique): same array path as multiple', async () => {
    const { result } = setup(
      makeElection({
        questions: [twoQuestions[0]],
        voteType: {
          maxCount: 3,
          maxValue: 1,
          maxVoteOverwrites: 0,
          costExponent: 1,
          uniqueChoices: false,
          costFromWeight: false,
        },
      }),
    )
    await result.current.vote({ '0': ['1'] })
    expect(state.vote).toHaveBeenCalledWith([1])
  })

  it('does not vote when the confirmation is declined', async () => {
    const { result } = setup(makeElection({ questions: twoQuestions }), false)
    const out = await result.current.vote({ '0': '1', '1': '0' })
    expect(out).toBe(false)
    expect(state.vote).not.toHaveBeenCalled()
  })

  it('returns false when there is no election', async () => {
    const { result } = setup(null)
    await waitFor(() => expect(result.current).toBeDefined())
    expect(await result.current.vote({ '0': '0' })).toBe(false)
    expect(state.vote).not.toHaveBeenCalled()
  })
})
