import { ComponentPropsWithoutRef } from 'react'
import { useComponents } from '../../context/useComponents'
import { useConfirm } from '../../../confirm/useConfirm'
import { useReactComponentsLocalize } from '../../../i18n/localize'
import { useActions, useElection } from '@vocdoni/react-providers'
import { ConfirmActionModal } from './ConfirmActionModal'
import { getElectionTitle } from '../../../election/normalized'

export const ActionEnd = (props: ComponentPropsWithoutRef<'button'>) => {
  const localize = useReactComponentsLocalize()
  const { confirm } = useConfirm()
  const { election } = useElection()
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
        (['ENDED', 'CANCELED', 'UPCOMING'] as (typeof election.status)[]).includes(election.status)
      }
      label={localize('actions.end')}
    />
  )
}
