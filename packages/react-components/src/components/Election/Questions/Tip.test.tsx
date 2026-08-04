import { describe, expect, it, vi } from 'vitest'
import { makeProcess, renderWithComponents } from '../../../test-utils'

const state = vi.hoisted(() => ({ election: null as ReturnType<typeof makeProcess> | null }))
vi.mock('@vocdoni/react-providers', () => ({
  useElection: () => ({ election: state.election, vote: vi.fn() }),
}))
vi.mock('../../../confirm/useConfirm', () => ({
  useConfirm: () => ({ confirm: () => Promise.resolve(true) }),
}))

import { act } from '@testing-library/react'
import { QuestionsFormProvider, useQuestionsForm } from './Form'
import { QuestionTip } from './Tip'

let captured: any
const slots = {
  components: {
    QuestionTip: (props: any) => {
      captured = props
      return null
    },
  },
}

let fmethods: ReturnType<typeof useQuestionsForm>['fmethods']
const GrabForm = () => {
  fmethods = useQuestionsForm().fmethods
  return null
}

const oneQuestion = [
  { title: 'Q', choices: [{ title: 'A', value: 0 }, { title: 'B', value: 1 }, { title: 'C', value: 2 }] },
]

function renderTip(election: ReturnType<typeof makeProcess>) {
  state.election = election
  captured = undefined
  renderWithComponents(
    <QuestionsFormProvider>
      <QuestionTip question={election.questions[0]} />
    </QuestionsFormProvider>,
    slots,
  )
  return captured
}

describe('QuestionTip (via inferQuestionBallotType)', () => {
  it('renders the pick-count tip for multichoice', () => {
    const tip = renderTip(
      makeProcess({ questions: oneQuestion, voteType: { maxCount: 3, maxValue: 2, uniqueChoices: true } }),
    )
    expect(tip?.text).toContain('3')
  })

  it('renders nothing for single-choice', () => {
    expect(renderTip(makeProcess({ questions: oneQuestion }))).toBeUndefined()
  })

  it('renders nothing for approval', () => {
    expect(
      renderTip(makeProcess({ questions: oneQuestion, voteType: { maxCount: 3, maxValue: 1 } })),
    ).toBeUndefined()
  })

  it("follows the voter's selections on the question's own field", () => {
    const election = makeProcess({
      questions: [oneQuestion[0], oneQuestion[0]],
      voteType: { maxCount: 3, maxValue: 2, uniqueChoices: true },
    })
    state.election = election
    captured = undefined
    renderWithComponents(
      <QuestionsFormProvider>
        <GrabForm />
        <QuestionTip question={election.questions[1]} index='1' />
      </QuestionsFormProvider>,
      slots,
    )

    expect(captured?.text).toContain('0')

    act(() => {
      fmethods.setValue('1', ['0', '2'])
    })
    expect(captured?.text).toContain('2')

    // Selections on OTHER questions must not leak into this tip's count.
    act(() => {
      fmethods.setValue('0', ['1'])
      fmethods.setValue('1', ['0', '1', '2'])
    })
    expect(captured?.text).toContain('3')
  })
})
