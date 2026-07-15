import type { QuestionStatus } from '@vocdoni/api-types'
import { ComponentPropsWithoutRef } from 'react'
import { useComponents } from '../context/useComponents'
import { useReactComponentsLocalize } from '../../i18n/localize'
import { useElection } from '@vocdoni/react-providers'

export const ElectionStatusBadge = (props: ComponentPropsWithoutRef<'span'> & Record<string, unknown>) => {
  const { status } = useElection()
  const localize = useReactComponentsLocalize()
  const { ElectionStatusBadge: Slot } = useComponents()

  if (!status) return null

  let tone: 'success' | 'warning' | 'danger' = 'success'

  if ((['PAUSED', 'ENDED'] as QuestionStatus[]).includes(status)) {
    tone = 'warning'
  }

  if ((['CANCELED'] as QuestionStatus[]).includes(status)) {
    tone = 'danger'
  }

  const label = localize(`statuses.${status.toLowerCase()}`)

  return <Slot {...props} tone={tone} label={label} />
}
