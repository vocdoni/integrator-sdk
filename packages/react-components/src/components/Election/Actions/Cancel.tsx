import { ComponentPropsWithoutRef } from 'react'
import { useComponents } from '../../context/useComponents'
import { useConfirm } from '../../../confirm/useConfirm'
import { useReactComponentsLocalize } from '../../../i18n/localize'
import { useActions, useElection } from '@vocdoni/react-providers'
import { ConfirmActionModal } from './ConfirmActionModal'
import { getElectionTitle } from '../../../election/normalized'

export const ActionCancel = (props: ComponentPropsWithoutRef<'button'>) => {
  const localize = useReactComponentsLocalize()
  const { confirm } = useConfirm()
  const { election } = useElection()
  const { ActionCancel: Slot } = useComponents()
  const { cancel, loading } = useActions()

  const handle = async () => {
    if (
      await confirm(
        <ConfirmActionModal
          title={localize('confirm.cancel_process_title')}
          description={localize('actions.cancel_description', { election: { title: getElectionTitle(election) } })}
          confirm={localize('confirm.cancel_process_button')}
          cancel={localize('confirm.cancel_button')}
        />
      )
    ) {
      await cancel()
    }
  }

  if (!election) {
    return null
  }

  return (
    <Slot
      {...props}
      loading={loading}
      onClick={handle}
      disabled={
        loading ||
        (['CANCELED', 'ENDED'] as (typeof election.status)[]).includes(election.status)
      }
      label={localize('actions.cancel')}
    />
  )
}
