import type { ElectionStatus } from '@vocdoni/api-types'
import { format as dformat, formatDistance } from 'date-fns'
import { ComponentPropsWithoutRef, useSyncExternalStore } from 'react'
import { useComponents } from '../context/useComponents'
import { useReactComponentsLocalize } from '../../i18n/localize'
import { useElection } from '@vocdoni/react-providers'
import { getElectionDate, getElectionStatus } from '../../election/normalized'

export type ElectionScheduleProps = ComponentPropsWithoutRef<'p'> &
  Record<string, unknown> & {
    format?: string
    showRemaining?: boolean
    showCreatedAt?: boolean
  }

const subscribe = () => () => {}
const useIsHydrationRender = () =>
  useSyncExternalStore(
    subscribe,
    () => false,
    () => true
  )
const formatDeterministicDate = (date: Date) => date.toISOString()

export const ElectionSchedule = ({
  format = 'PPp',
  showRemaining = false,
  showCreatedAt = false,
  ...rest
}: ElectionScheduleProps) => {
  const { election } = useElection()
  const t = useReactComponentsLocalize()
  const { ElectionSchedule: Slot } = useComponents()
  const isHydrationRender = useIsHydrationRender()
  const startDate = getElectionDate(election, 'startDate')
  const endDate = getElectionDate(election, 'endDate')
  const status = getElectionStatus(election)

  if (!election || !startDate || !endDate || !status) return null

  const getRemaining = (now: Date): string => {
    switch (status as ElectionStatus) {
      case 'READY':
        if (endDate < now) {
          return t('schedule.ended', {
            distance: formatDistance(endDate, now, { addSuffix: true }),
          })
        }
        return formatDistance(endDate, now, { addSuffix: true })
      case 'ENDED':
        return t('schedule.ended', {
          distance: formatDistance(endDate, now, { addSuffix: true }),
        })
      case 'PAUSED':
        if (now < startDate) {
          return t('schedule.paused_start', {
            distance: formatDistance(startDate, now, { addSuffix: true }),
          })
        }
        return t('schedule.paused_end', {
          distance: formatDistance(endDate, now, { addSuffix: true }),
        })
      case 'UPCOMING':
      default:
        return formatDistance(startDate, now, { addSuffix: true })
    }
  }

  const getDeterministicText = () => {
    return t('schedule.from_begin_to_end', {
      begin: formatDeterministicDate(startDate),
      end: formatDeterministicDate(endDate),
    })
  }

  let text = getDeterministicText()

  if (!isHydrationRender) {
    const now = new Date()

    text = t('schedule.from_begin_to_end', {
      begin: dformat(startDate, format),
      end: dformat(endDate, format),
    })

    if (showRemaining) {
      text = getRemaining(now)
    }
  }

  return <Slot {...rest} text={text} />
}
