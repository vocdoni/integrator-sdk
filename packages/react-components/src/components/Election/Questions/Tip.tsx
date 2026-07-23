import type { VotingProcessQuestion } from '@vocdoni/api-types'
import { BallotType, inferQuestionBallotType, questionSelectionRange } from '@vocdoni/ballot'
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
    // The pick bound, not ballotProtocol.maxCount — on the dense layout maxCount
    // is the number of choices, and the bound lives in maxTotalCost.
    maxcount: questionSelectionRange(question).max,
  })

  if (!text) return null

  return <Slot text={text} />
}
