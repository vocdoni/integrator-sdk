import { questionSelectionRange } from '@vocdoni/ballot'
import type { ReactNode } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import { makeProcess, renderWithComponents } from '../../../test-utils'

const state = vi.hoisted(() => ({
  election: null as ReturnType<typeof makeProcess> | null,
  status: 'ONGOING' as string,
  isAbleToVote: true,
}))
vi.mock('@vocdoni/react-providers', () => ({
  useElection: () => ({ election: state.election, status: state.status, isAbleToVote: state.isAbleToVote }),
}))

import { ElectionQuestion } from './Fields'

const FormHost = ({ children }: { children: ReactNode }) => {
  const methods = useForm()
  return <FormProvider {...methods}>{children}</FormProvider>
}

const threeChoices = {
  title: 'Q1',
  choices: [
    { title: 'A', value: 0 },
    { title: 'B', value: 1 },
    { title: 'C', value: 2 },
  ],
}

function renderQuestion(election: ReturnType<typeof makeProcess>) {
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

describe('ElectionQuestion field switching (via inferQuestionBallotType)', () => {
  it('single-choice: radios, single selection mode', () => {
    const captured = renderQuestion(makeProcess({ questions: [threeChoices] }))
    expect(captured.selectionMode).toBe('single')
    expect(onlyControl(captured.controls)).toEqual(['radio'])
  })

  it('approval (maxValue 1, repeatable): checkboxes, multiple selection mode', () => {
    const captured = renderQuestion(
      makeProcess({ questions: [threeChoices], voteType: { maxCount: 3, maxValue: 1 } }),
    )
    expect(captured.selectionMode).toBe('multiple')
    expect(onlyControl(captured.controls)).toEqual(['checkbox'])
  })

  it('multichoice (maxValue > 1, unique): checkboxes, multiple selection mode', () => {
    const captured = renderQuestion(
      makeProcess({ questions: [threeChoices], voteType: { maxCount: 3, maxValue: 2, uniqueChoices: true } }),
    )
    expect(captured.selectionMode).toBe('multiple')
    expect(onlyControl(captured.controls)).toEqual(['checkbox'])
  })

  it('budget/quadratic: selectionMode matches the rendered radios (no dedicated widget yet)', () => {
    // maxValue 0 → budget/quadratic; they fall through to the SingleChoice widget
    // (radios), so selectionMode must stay 'single' to match what is rendered.
    const captured = renderQuestion(
      makeProcess({ questions: [threeChoices], voteType: { maxCount: 3, maxValue: 0, costExponent: 1 } }),
    )
    expect(captured.selectionMode).toBe('single')
    expect(onlyControl(captured.controls)).toEqual(['radio'])
  })
})

describe('questionSelectionRange', () => {
  it('requires exactly maxCount when abstain is not reserved', () => {
    // uniqueChoices needs maxValue >= (numChoices); maxValue 2 does not reserve for 3 choices.
    const question = makeProcess({
      questions: [threeChoices],
      voteType: { maxCount: 3, maxValue: 2, uniqueChoices: true },
    }).questions[0]
    expect(questionSelectionRange(question)).toEqual({ min: 3, max: 3 })
  })

  it('allows 1..maxCount when abstain is reserved (partial selection castable)', () => {
    // repeatable multichoice, numChoices 3 → needed maxValue 3; maxValue 3 reserves.
    const question = makeProcess({
      questions: [threeChoices],
      voteType: { maxCount: 3, maxValue: 3, uniqueChoices: false },
    }).questions[0]
    expect(questionSelectionRange(question)).toEqual({ min: 1, max: 3 })
  })
})
