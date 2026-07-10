import type { ReactNode } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import { makeElection, renderWithComponents } from '../../../test-utils'

// FieldSwitcher / ElectionQuestion read the election from the providers; give them
// a controllable one and a voter who is able to vote.
const state = vi.hoisted(() => ({ election: null as ReturnType<typeof makeElection> | null }))
vi.mock('@vocdoni/react-providers', () => ({
  useElection: () => ({ election: state.election, isAbleToVote: true }),
}))

import { ElectionQuestion, multiChoiceSelectionRange } from './Fields'

const FormHost = ({ children }: { children: ReactNode }) => {
  const methods = useForm()
  return <FormProvider {...methods}>{children}</FormProvider>
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

const threeChoices = {
  title: 'Q1',
  choices: [
    { title: 'A', value: 0 },
    { title: 'B', value: 1 },
    { title: 'C', value: 2 },
  ],
}

// Render one question and capture (a) the selectionMode the ElectionQuestion slot
// receives and (b) the control type each choice renders with. The switcher picks
// radios for single-choice and checkboxes for approval/multichoice.
function renderQuestion(election: ReturnType<typeof makeElection>) {
  state.election = election
  const captured: { selectionMode?: string; controls: string[] } = { controls: [] }
  renderWithComponents(
    <FormHost>
      <ElectionQuestion question={election.questions[0]} index='0' />
    </FormHost>,
    {
      components: {
        ElectionQuestion: (props: any) => {
          captured.selectionMode = props.selectionMode
          return <>{props.fields}</>
        },
        QuestionChoice: (props: any) => {
          captured.controls.push(props.controlType)
          return null
        },
      },
    },
  )
  return captured
}

// The choice list may render more than once (StrictMode double-invoke), so assert
// on the distinct control type rather than the exact array length.
const onlyControl = (controls: string[]) => [...new Set(controls)]

describe('ElectionQuestion field switching (via inferBallotType)', () => {
  it('single-choice: radios, single selection mode', () => {
    const captured = renderQuestion(makeElection({ questions: [threeChoices] }))
    expect(captured.selectionMode).toBe('single')
    expect(onlyControl(captured.controls)).toEqual(['radio'])
  })

  it('approval (maxValue 1, repeatable): checkboxes, multiple selection mode', () => {
    const captured = renderQuestion(
      makeElection({ questions: [threeChoices], voteType: voteType({ maxCount: 3, maxValue: 1 }) }),
    )
    expect(captured.selectionMode).toBe('multiple')
    expect(onlyControl(captured.controls)).toEqual(['checkbox'])
  })

  it('multichoice (maxValue > 1, unique): checkboxes, multiple selection mode', () => {
    const captured = renderQuestion(
      makeElection({
        questions: [threeChoices],
        voteType: voteType({ maxCount: 3, maxValue: 2, uniqueChoices: true }),
      }),
    )
    expect(captured.selectionMode).toBe('multiple')
    expect(onlyControl(captured.controls)).toEqual(['checkbox'])
  })
})

describe('multiChoiceSelectionRange', () => {
  it('requires exactly maxCount when abstain is not reserved', () => {
    // uniqueChoices needs maxValue >= 5 here (3 - 1 + 3); maxValue 2 does not reserve.
    const election = makeElection({
      questions: [threeChoices],
      voteType: voteType({ maxCount: 3, maxValue: 2, uniqueChoices: true }),
    })
    expect(multiChoiceSelectionRange(election)).toEqual({ min: 3, max: 3 })
  })

  it('allows 1..maxCount when abstain is reserved (partial selection castable)', () => {
    // repeatable multichoice, numChoices 3 → needed maxValue 3; maxValue 3 reserves.
    const election = makeElection({
      questions: [threeChoices],
      voteType: voteType({ maxCount: 3, maxValue: 3, uniqueChoices: false }),
    })
    expect(multiChoiceSelectionRange(election)).toEqual({ min: 1, max: 3 })
  })
})
