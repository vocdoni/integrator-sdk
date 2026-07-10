import { BallotType, inferBallotType } from '@vocdoni/ballot'
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

  const { maxCount } = election.voteType
  // Determine if weighted: census size vs weight (not available in simple API)
  const weighted = ''

  let title = ''
  let tooltip = ''

  // Label from the inferred ballot type, the same inference the encoder/decoder use.
  switch (inferBallotType(election)) {
    case BallotType.SingleChoice:
      title = t('question_types.singlechoice_title', { weighted })
      break
    case BallotType.MultiChoice:
      title = t('question_types.multichoice_title', { weighted })
      tooltip = t('question_types.multichoice_tooltip', { maxcount: maxCount })
      break
    case BallotType.Approval:
      title = t('question_types.approval_title')
      tooltip = t('question_types.approval_tooltip', { maxcount: maxCount })
      break
    case BallotType.Budget:
      title = t('question_types.budget_title', { weighted })
      tooltip = t('question_types.budget_tooltip')
      break
    case BallotType.Quadratic:
      title = t('question_types.quadratic_title', { weighted })
      tooltip = t('question_types.quadratic_tooltip')
      break
  }

  if (!title) return null

  return <Slot {...props} title={title} tooltip={tooltip} />
}
