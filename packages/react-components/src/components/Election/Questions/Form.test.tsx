import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { makeProcess } from '../../../test-utils'

// Election + a spy vote() come from the (mocked) providers; confirm() is forced true.
const state = vi.hoisted(() => ({
  election: null as ReturnType<typeof makeProcess> | null,
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
import { ComponentsProvider } from '../../context/ComponentsProvider'

// ComponentsProvider is needed because QuestionsFormProvider auto-mounts a
// ConfirmProvider, whose modal renders through the ConfirmShell slot.
const wrapper = ({ children }: { children: ReactNode }) => (
  <ComponentsProvider>
    <QuestionsFormProvider>{children}</QuestionsFormProvider>
  </ComponentsProvider>
)

function setup(election: ReturnType<typeof makeProcess> | null, confirmResult = true) {
  state.election = election
  state.vote = vi.fn().mockResolvedValue('vote-id')
  state.confirmResult = confirmResult
  return renderHook(useQuestionsForm, { wrapper })
}

const twoQuestions = [
  { title: 'Q1', choices: [{ title: 'A', value: 0 }, { title: 'B', value: 1 }] },
  { title: 'Q2', choices: [{ title: 'A', value: 0 }, { title: 'B', value: 1 }] },
]

const threeChoices = [
  { title: 'Q1', choices: [{ title: 'A', value: 0 }, { title: 'B', value: 1 }, { title: 'C', value: 2 }] },
]

const fourChoices = [
  {
    title: 'Q1',
    choices: [
      { title: 'A', value: 0 },
      { title: 'B', value: 1 },
      { title: 'C', value: 2 },
      { title: 'D', value: 3 },
    ],
  },
]

// The payloads below go through @vocdoni/ballot's encodeQuestionBallot, so the expected
// vectors are the real on-chain encodings. vote() now receives number[][] — one encoded
// ballot array per question.
describe('QuestionsFormProvider vote payload', () => {
  it('single choice: one chosen value per question', async () => {
    const { result } = setup(makeProcess({ questions: twoQuestions }))
    await result.current.vote({ '0': '1', '1': '0' })
    expect(state.vote).toHaveBeenCalledWith([[1], [0]])
  })

  it('approval: dense 0/1 vector over all choices (not an index list)', async () => {
    const { result } = setup(
      makeProcess({ questions: threeChoices, voteType: { maxCount: 3, maxValue: 1 } }),
    )
    // Approve A and C → [1,0,1]. The old code wrongly emitted the index list [0,2].
    await result.current.vote({ '0': ['0', '2'] })
    expect(state.vote).toHaveBeenCalledWith([[1, 0, 1]])
  })

  it('multichoice (fully filled): the picked values, in pick order', async () => {
    const { result } = setup(
      makeProcess({ questions: threeChoices, voteType: { maxCount: 3, maxValue: 2, uniqueChoices: true } }),
    )
    await result.current.vote({ '0': ['2', '0', '1'] })
    expect(state.vote).toHaveBeenCalledWith([[2, 0, 1]])
  })

  it('multichoice (abstain): unfilled slots padded with the abstain sentinel', async () => {
    const { result } = setup(
      makeProcess({ questions: fourChoices, voteType: { maxCount: 3, maxValue: 4 } }),
    )
    // One real pick for a 3-slot ballot → [1,4,4] (value 4 is the abstain sentinel).
    await result.current.vote({ '0': ['1'] })
    expect(state.vote).toHaveBeenCalledWith([[1, 4, 4]])
  })

  it('threads reserved memo.{index} fields through as per-question memos', async () => {
    const { result } = setup(makeProcess({ questions: twoQuestions }))
    // Only question 0 carries a memo; empty strings are dropped, not sent.
    await result.current.vote({ '0': '1', '1': '0', memo: { '0': 'Other: neither', '1': '' } })
    expect(state.vote).toHaveBeenCalledWith([[1], [0]], ['Other: neither', undefined])
  })

  it('does not vote when the confirmation is declined', async () => {
    const { result } = setup(makeProcess({ questions: twoQuestions }), false)
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
