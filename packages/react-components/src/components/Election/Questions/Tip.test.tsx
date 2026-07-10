import { describe, expect, it, vi } from 'vitest'
import { makeElection, renderWithComponents } from '../../../test-utils'

const state = vi.hoisted(() => ({ election: null as ReturnType<typeof makeElection> | null }))
vi.mock('@vocdoni/react-providers', () => ({
  useElection: () => ({ election: state.election, vote: vi.fn() }),
}))
vi.mock('../../../confirm/useConfirm', () => ({
  useConfirm: () => ({ confirm: () => Promise.resolve(true) }),
}))

import { QuestionsFormProvider } from './Form'
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

const voteType = (overrides: Record<string, unknown>) => ({
  maxCount: 1,
  maxValue: 1,
  maxVoteOverwrites: 0,
  costExponent: 1,
  uniqueChoices: false,
  costFromWeight: false,
  ...overrides,
})

const oneQuestion = [
  { title: 'Q', choices: [{ title: 'A', value: 0 }, { title: 'B', value: 1 }, { title: 'C', value: 2 }] },
]

function renderTip(election: ReturnType<typeof makeElection>) {
  state.election = election
  captured = undefined
  renderWithComponents(
    <QuestionsFormProvider>
      <QuestionTip />
    </QuestionsFormProvider>,
    slots,
  )
  return captured
}

describe('QuestionTip (via inferBallotType)', () => {
  it('renders the pick-count tip for multichoice', () => {
    const tip = renderTip(
      makeElection({ questions: oneQuestion, voteType: voteType({ maxCount: 3, maxValue: 2, uniqueChoices: true }) }),
    )
    expect(tip?.text).toContain('3')
  })

  it('renders nothing for single-choice', () => {
    expect(renderTip(makeElection({ questions: oneQuestion }))).toBeUndefined()
  })

  it('renders nothing for approval', () => {
    expect(
      renderTip(makeElection({ questions: oneQuestion, voteType: voteType({ maxCount: 3, maxValue: 1 }) })),
    ).toBeUndefined()
  })
})
