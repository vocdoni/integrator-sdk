import type { Election } from '@vocdoni/api-types'
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

  const answersView = election.questions.map((question, index) => {
    const indexedAnswer = answers[index.toString()]
    const isSingleChoice = typeof indexedAnswer === 'string'

    if (isSingleChoice) {
      const selected = parseInt((answers[index.toString()] as string) || '', 10)
      const selectedChoice = question.choices.find((choice) => choice.value === selected)
      return {
        question: resolveTitle(question.title),
        answers: [selectedChoice ? resolveTitle(selectedChoice.title) : ''],
      }
    }

    const rawSelectedValues = answers[0]
    const selectedValues = (Array.isArray(rawSelectedValues) ? rawSelectedValues : ['-1']).map((value) => Number(value))
    const mappedAnswers = selectedValues.map((value) => {
      const choice = question.choices[value]
      return choice ? resolveTitle(choice.title) : t('vote.abstain')
    })
    return {
      question: resolveTitle(question.title),
      answers: mappedAnswers,
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
