import { ComponentPropsWithoutRef } from 'react'
import { useComponents } from '../../context/useComponents'
import { useReactComponentsLocalize } from '../../../i18n/localize'
import { useElection } from '@vocdoni/react-providers'

export const QuestionsTypeBadge = (props: ComponentPropsWithoutRef<'div'> & Record<string, unknown>) => {
  const { election } = useElection()
  const { QuestionsTypeBadge: Slot } = useComponents()
  const t = useReactComponentsLocalize()

  if (!election) {
    return null
  }

  const { maxCount, uniqueChoices } = election.voteType
  // Determine if weighted: census size vs weight (not available in simple API)
  const weighted = ''

  let title = ''
  let tooltip = ''

  if (maxCount === 1) {
    title = t('question_types.singlechoice_title', { weighted })
  } else if (uniqueChoices) {
    title = t('question_types.multichoice_title', { weighted })
    tooltip = t('question_types.multichoice_tooltip', { maxcount: maxCount })
  } else {
    title = t('question_types.approval_title')
    tooltip = t('question_types.approval_tooltip', { maxcount: maxCount })
  }

  if (!title) return null

  return <Slot {...props} title={title} tooltip={tooltip} />
}
