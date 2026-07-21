import { ComponentPropsWithoutRef } from 'react'
import { useComponents } from '../../context/useComponents'
import { EnsureConfirmProvider } from '../../../confirm/ConfirmProvider'
import { useConfirm } from '../../../confirm/useConfirm'
import { useReactComponentsLocalize } from '../../../i18n/localize'
import { useActions, useElection } from '@vocdoni/react-providers'
import { ConfirmActionModal } from './ConfirmActionModal'
import { getElectionTitle } from '../../../election/normalized'

// Mounts its own ConfirmProvider when the app doesn't provide one, so the
// confirmation dialog works out of the box.
export const ActionEnd = (props: ComponentPropsWithoutRef<'button'>) => (
  <EnsureConfirmProvider>
    <ActionEndButton {...props} />
  </EnsureConfirmProvider>
)

const ActionEndButton = (props: ComponentPropsWithoutRef<'button'>) => {
  const localize = useReactComponentsLocalize()
  const { confirm } = useConfirm()
  const { election, status } = useElection()
  const { ActionEnd: Slot } = useComponents()
  const { end, loading } = useActions()

  const handle = async () => {
    if (
      await confirm(
        <ConfirmActionModal
          title={localize('confirm.end_process_title')}
          description={localize('actions.end_description', { election: { title: getElectionTitle(election) } })}
          confirm={localize('confirm.end_process_button')}
          cancel={localize('confirm.cancel_button')}
        />
      )
    ) {
      await end()
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
        status === 'ENDED' ||
        status === 'CANCELED' ||
        status === 'UPCOMING'
      }
      label={localize('actions.end')}
    />
  )
}
