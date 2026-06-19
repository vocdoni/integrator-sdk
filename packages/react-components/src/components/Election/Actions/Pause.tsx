import { ComponentPropsWithoutRef } from 'react'
import { useComponents } from '../../context/useComponents'
import { useReactComponentsLocalize } from '../../../i18n/localize'
import { useActions, useElection } from '@vocdoni/react-providers'

export const ActionPause = (props: ComponentPropsWithoutRef<'button'>) => {
  const localize = useReactComponentsLocalize()
  const { election } = useElection()
  const { ActionPause: Slot } = useComponents()
  const { pause, loading } = useActions()

  if (!election) {
    return null
  }

  return (
    <Slot
      {...props}
      loading={loading}
      onClick={pause}
      disabled={loading || election.status !== 'READY'}
      label={localize('actions.pause')}
    />
  )
}
