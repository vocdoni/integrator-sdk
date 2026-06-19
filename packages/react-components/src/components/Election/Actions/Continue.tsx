import { ComponentPropsWithoutRef } from 'react'
import { useComponents } from '../../context/useComponents'
import { useReactComponentsLocalize } from '../../../i18n/localize'
import { useActions, useElection } from '@vocdoni/react-providers'

export const ActionContinue = (props: ComponentPropsWithoutRef<'button'>) => {
  const localize = useReactComponentsLocalize()
  const { election } = useElection()
  const { ActionContinue: Slot } = useComponents()
  const { resume, loading } = useActions()

  if (!election) {
    return null
  }

  return (
    <Slot
      {...props}
      loading={loading}
      onClick={resume}
      disabled={loading || election.status !== 'PAUSED'}
      label={localize('actions.continue')}
    />
  )
}
