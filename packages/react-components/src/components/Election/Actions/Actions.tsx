import { ComponentPropsWithoutRef } from 'react'
import { useComponents } from '../../context/useComponents'
import { useElection } from '@vocdoni/react-providers'
import { ActionsProvider } from './ActionsProvider'
import { ActionCancel } from './Cancel'
import { ActionContinue } from './Continue'
import { ActionEnd } from './End'
import { ActionPause } from './Pause'

export const ElectionActions = (props: ComponentPropsWithoutRef<'div'>) => {
  const { election } = useElection()
  const { ElectionActions: Slot } = useComponents()

  if (
    !election ||
    (['CANCELED', 'ENDED'] as (typeof election.status)[]).includes(election.status)
  ) {
    return null
  }

  return (
    <Slot
      {...props}
      actions={
        <ActionsProvider>
          <ActionContinue />
          <ActionPause />
          <ActionEnd />
          <ActionCancel />
        </ActionsProvider>
      }
    />
  )
}
