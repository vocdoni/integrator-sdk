import { describe, expect, it, vi } from 'vitest'
import { makeProcess, renderWithComponents } from '../../../test-utils'

const state = vi.hoisted(() => ({ election: null as ReturnType<typeof makeProcess> | null }))
vi.mock('@vocdoni/react-providers', () => ({ useElection: () => ({ election: state.election }) }))

import { QuestionsTypeBadge } from './TypeBadge'

let captured: any
const Slot = (props: any) => {
  captured = props
  return null
}
const slots = { components: { QuestionsTypeBadge: Slot } }

const oneQuestion = [{ title: 'Q', choices: [{ title: 'A', value: 0 }, { title: 'B', value: 1 }] }]

function renderBadge(election: ReturnType<typeof makeProcess>) {
  state.election = election
  captured = undefined
  renderWithComponents(<QuestionsTypeBadge />, slots)
  return captured
}

describe('QuestionsTypeBadge label (via inferQuestionBallotType)', () => {
  it('single-choice', () => {
    const badge = renderBadge(makeProcess({ questions: oneQuestion }))
    expect(badge.title).toContain('Single Choice')
  })

  it('approval', () => {
    const badge = renderBadge(makeProcess({ questions: oneQuestion, voteType: { maxCount: 3, maxValue: 1 } }))
    expect(badge.title).toContain('Approval')
    expect(badge.tooltip).toBeTruthy()
  })

  it('multichoice', () => {
    const badge = renderBadge(
      makeProcess({ questions: oneQuestion, voteType: { maxCount: 3, maxValue: 2, uniqueChoices: true } }),
    )
    expect(badge.title).toContain('Multichoice')
    expect(badge.tooltip).toContain('3')
  })

  it('budget', () => {
    const badge = renderBadge(
      makeProcess({ questions: oneQuestion, voteType: { maxCount: 5, maxValue: 0, costExponent: 1 } }),
    )
    expect(badge.title).toContain('Budget')
    expect(badge.tooltip).toBeTruthy()
  })

  it('quadratic', () => {
    const badge = renderBadge(
      makeProcess({ questions: oneQuestion, voteType: { maxCount: 5, maxValue: 0, costExponent: 2 } }),
    )
    expect(badge.title).toContain('Quadratic')
    expect(badge.tooltip).toBeTruthy()
  })
})
