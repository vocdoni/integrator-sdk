import type { QuestionStatus, VotingProcessResultsResponse } from '@vocdoni/api-types'
import { describe, expect, it, vi } from 'vitest'
import { makeProcess, makeResults, renderWithComponents } from '../../test-utils'

const state = vi.hoisted(() => ({
  election: null as ReturnType<typeof makeProcess> | null,
  status: null as QuestionStatus | null,
  results: null as VotingProcessResultsResponse | null,
}))
vi.mock('@vocdoni/react-providers', () => ({ useElection: () => state }))

import { ElectionResults } from './Results'

// Capture the props the slot receives so we can assert on the computed results.
let captured: any
const Slot = (props: any) => {
  captured = props
  return null
}
const slots = { components: { ElectionResults: Slot } }

const question = {
  title: 'Q1',
  choices: [
    { title: 'A', value: 0 },
    { title: 'B', value: 1 },
  ],
}

describe('ElectionResults', () => {
  it('defaults a missing choice result to zero votes', () => {
    state.election = makeProcess({ questions: [question] })
    state.status = 'RESULTS'
    state.results = makeResults([{ results: [['5']] }])
    renderWithComponents(<ElectionResults />, slots)

    const choices = captured.questions[0].choices
    expect(choices[0].votes).toBe('5')
    expect(choices[1].votes).toBe('0')
    expect(choices[0].percent).toBe('100.0%')
    expect(choices[1].percent).toBe('0.0%')
  })

  it('decodes multichoice results by column-sum and appends a unified abstain row', () => {
    const multichoice = {
      title: 'Q1',
      choices: [
        { title: 'A', value: 0 },
        { title: 'B', value: 1 },
        { title: 'C', value: 2 },
      ],
    }
    state.election = makeProcess({
      questions: [multichoice],
      voteType: { maxCount: 3, maxValue: 3, uniqueChoices: false },
    })
    state.status = 'RESULTS'
    // 3 pick-slots; each real choice picked once, the rest abstained (column 3).
    state.results = makeResults([{
      results: [
        ['1', '0', '0', '2'],
        ['0', '1', '0', '2'],
        ['0', '0', '1', '2'],
      ],
    }])
    renderWithComponents(<ElectionResults />, slots)

    const choices = captured.questions[0].choices
    // 3 real choices (column-summed to 1 each) + 1 unified abstain row (2+2+2 = 6)
    expect(choices.map((c: any) => c.votes)).toEqual(['1', '1', '1', '6'])
    expect(choices[3].title).toBe('Abstain')
    // percentages share the question total (9): abstain = 6/9
    expect(choices[3].percent).toBe('66.7%')
  })

  it('renders nothing for a canceled election', () => {
    state.election = makeProcess({ questions: [question] })
    state.status = 'CANCELED'
    state.results = null
    const { container } = renderWithComponents(<ElectionResults />, slots)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the secret-until-the-end placeholder before final results', () => {
    captured = undefined
    state.election = makeProcess({
      electionType: { secretUntilTheEnd: true },
      questions: [question],
    })
    state.status = 'ONGOING'
    state.results = makeResults([{ finalResults: false }])
    renderWithComponents(<ElectionResults />, slots)

    expect(captured.secretText).toContain('Secret until the end')
    expect(captured.questions).toBeUndefined()
  })

  it('forceRender overrides the secret placeholder', () => {
    state.election = makeProcess({
      electionType: { secretUntilTheEnd: true },
      questions: [question],
    })
    state.status = 'ONGOING'
    state.results = makeResults([{ finalResults: false, results: [['1', '2']] }])
    renderWithComponents(<ElectionResults forceRender />, slots)
    expect(captured.questions[0].choices).toHaveLength(2)
  })
})
