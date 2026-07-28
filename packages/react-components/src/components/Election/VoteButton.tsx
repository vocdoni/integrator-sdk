import { ComponentPropsWithoutRef } from 'react'
import { VoteButtonSlotProps } from '../context/types'
import { useComponents } from '../context/useComponents'
import { useReactComponentsLocalize } from '../../i18n/localize'
import { useElection } from '@vocdoni/react-providers'

export const VoteButton = (props: ComponentPropsWithoutRef<'button'> & Record<string, unknown>) => {
  const externalDisabled = Boolean(props.disabled)
  const { election, status, isAbleToVote, voting } = useElection()
  const { VoteButton: Slot } = useComponents()
  const t = useReactComponentsLocalize()

  if (!election) {
    return null
  }

  const isDisabled = !isAbleToVote || status !== 'ONGOING' || externalDisabled

  const button: VoteButtonSlotProps = {
    type: 'submit' as const,
    ...(props as Omit<VoteButtonSlotProps, 'label' | 'type'>),
    form: `election-questions-${election.id}`,
    // Also disabled while the vote is in flight — closes the double-submit window.
    disabled: isDisabled || voting,
    loading: voting,
    // Re-voting isn't supported by the SaaS process model (`isAbleToVote`
    // excludes voted users), so there is no "update your vote" label variant.
    label: t('vote.button'),
  }

  return <Slot {...button} />
}
