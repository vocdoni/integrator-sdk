import { ComponentPropsWithoutRef } from 'react'
import { VoteButtonSlotProps } from '../context/types'
import { useComponents } from '../context/useComponents'
import { useReactComponentsLocalize } from '../../i18n/localize'
import { useElection } from '@vocdoni/react-providers'

export const VoteButton = (props: ComponentPropsWithoutRef<'button'> & Record<string, unknown>) => {
  const externalDisabled = Boolean(props.disabled)
  const { election, isAbleToVote, hasVoted } = useElection()
  const { VoteButton: Slot } = useComponents()
  const t = useReactComponentsLocalize()

  if (!election) {
    return null
  }

  const isDisabled = !isAbleToVote || election.status !== 'READY' || externalDisabled

  const button: VoteButtonSlotProps = {
    type: 'submit' as const,
    ...(props as Omit<VoteButtonSlotProps, 'label' | 'type'>),
    form: `election-questions-${election.id}`,
    disabled: isDisabled,
    loading: false,
    label: hasVoted && isAbleToVote ? t('vote.button_update') : t('vote.button'),
  }

  return <Slot {...button} />
}
