import type { Election } from '@vocdoni/api-types'
import { BallotType, inferBallotType } from '@vocdoni/ballot'
import { FieldValues } from 'react-hook-form'
import { useComponents } from '../../context/useComponents'
import { useConfirm } from '../../../confirm/useConfirm'
import { useReactComponentsLocalize } from '../../../i18n/localize'
import { resolveTitle } from '../../../election/normalized'

export type QuestionsConfirmationProps = {
  answers: FieldValues
  election: Election
}

export const QuestionsConfirmation = ({ answers, election }: QuestionsConfirmationProps) => {
  const { QuestionsConfirmation: Slot } = useComponents()
  const { proceed, cancel } = useConfirm()
  const t = useReactComponentsLocalize()

  // Single-choice fields (including every question of a multi-question election) hold
  // one value string; approval/multichoice hold an array of value strings.
  const isSingleChoice = inferBallotType(election) === BallotType.SingleChoice

  const answersView = election.questions.map((question, index) => {
    const raw = answers[index.toString()]

    // Resolve each selected choice VALUE to its title (value-based, never positional).
    // A value with no matching choice is an abstain sentinel (multichoice only).
    const titleForValue = (value: number) => {
      const choice = question.choices.find((c) => c.value === value)
      return choice ? resolveTitle(choice.title) : t('vote.abstain')
    }

    const selectedValues = isSingleChoice
      ? raw !== undefined && raw !== '' ? [Number(raw)] : []
      : Array.isArray(raw) ? raw.map((value) => Number(value)) : []

    return {
      question: resolveTitle(question.title),
      answers: selectedValues.length ? selectedValues.map(titleForValue) : [''],
    }
  })

  return (
    <Slot
      election={election}
      answers={answers}
      answersView={answersView}
      onConfirm={() => proceed?.()}
      onCancel={() => cancel?.()}
    />
  )
}
