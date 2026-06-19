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

  const maxCount = election.voteType.maxCount
  const uniqueChoices = election.voteType.uniqueChoices

  // Only show tip for multiple choice elections
  if (maxCount <= 1 || uniqueChoices) return null

  // Show tip for "multiple" style (not approval — approval doesn't have a maxCount constraint)
  let text = ''
  if (maxCount > 1 && uniqueChoices) {
    text = t('question_types.multichoice_desc', {
      selected: getValues()[0]?.length,
      maxcount: maxCount,
    })
  }

  if (!text) return null

  return <Slot text={text} />
}
