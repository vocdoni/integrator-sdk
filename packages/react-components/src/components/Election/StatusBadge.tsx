import type { ElectionStatus } from '@vocdoni/api-types'
import { ComponentPropsWithoutRef } from 'react'
import { useComponents } from '../context/useComponents'
import { useReactComponentsLocalize } from '../../i18n/localize'
import { useElection } from '@vocdoni/react-providers'

export const ElectionStatusBadge = (props: ComponentPropsWithoutRef<'span'> & Record<string, unknown>) => {
  const { election } = useElection()
  const localize = useReactComponentsLocalize()
  const { ElectionStatusBadge: Slot } = useComponents()

  if (!election) return null

  let tone: 'success' | 'warning' | 'danger' = 'success'
  const status: ElectionStatus = election.status

  if (status && (['PAUSED', 'ENDED'] as ElectionStatus[]).includes(status)) {
    tone = 'warning'
  }

  if (status && (['CANCELED'] as ElectionStatus[]).includes(status)) {
    tone = 'danger'
  }

  const label = status ? localize(`statuses.${status.toLowerCase()}`) : localize('statuses.invalid')

  return <Slot {...props} tone={tone} label={label} />
}
