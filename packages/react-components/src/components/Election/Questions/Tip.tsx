import { BallotType, inferBallotType } from '@vocdoni/ballot'
import { useComponents } from '../../context/useComponents'
import { useReactComponentsLocalize } from '../../../i18n/localize'
import { useElection } from '@vocdoni/react-providers'
import { useQuestionsForm } from './Form'

export const QuestionTip = () => {
  const { QuestionTip: Slot } = useComponents()
  const {
    fmethods: { getValues },
  } = useQuestionsForm()
  const { election } = useElection()
  const t = useReactComponentsLocalize()

  if (!election) return null

  // Only multichoice has a "pick up to N" constraint worth surfacing as a tip:
  // single-choice picks exactly one and approval has no count limit. (The previous
  // inline guard contradicted itself and never rendered — this restores the intent.)
  if (inferBallotType(election) !== BallotType.MultiChoice) return null

  const text = t('question_types.multichoice_desc', {
    selected: getValues()[0]?.length,
    maxcount: election.voteType.maxCount,
  })

  if (!text) return null

  return <Slot text={text} />
}
