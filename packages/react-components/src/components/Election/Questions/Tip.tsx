import type { VotingProcessQuestion } from '@vocdoni/api-types'
import { BallotType, inferQuestionBallotType } from '@vocdoni/ballot'
import { useComponents } from '../../context/useComponents'
import { useReactComponentsLocalize } from '../../../i18n/localize'
import { useQuestionsForm } from './Form'

export const QuestionTip = ({ question }: { question?: VotingProcessQuestion }) => {
  const { QuestionTip: Slot } = useComponents()
  const {
    fmethods: { getValues },
  } = useQuestionsForm()
  const t = useReactComponentsLocalize()

  if (!question) return null

  if (inferQuestionBallotType(question) !== BallotType.MultiChoice) return null

  const text = t('question_types.multichoice_desc', {
    selected: getValues()[0]?.length,
    maxcount: question.ballotProtocol?.maxCount ?? 1,
  })

  if (!text) return null

  return <Slot text={text} />
}
