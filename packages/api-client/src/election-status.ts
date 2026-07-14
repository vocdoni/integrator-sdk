import type { Election } from '@vocdoni/api-types'

/**
 * True when the election is actively accepting votes: status READY and the
 * current time is between startDate and endDate.
 */
export const isLive = (election: Election): boolean => {
  if (election.status !== 'READY') return false
  const now = Date.now()
  return now >= new Date(election.startDate).getTime() && now <= new Date(election.endDate).getTime()
}

/**
 * True when the election is scheduled but not yet started: status READY and
 * the current time is before startDate.
 */
export const isUpcoming = (election: Election): boolean => {
  if (election.status !== 'READY') return false
  return Date.now() < new Date(election.startDate).getTime()
}

/**
 * True when the election has final published results: status ENDED and
 * finalResults is true.
 */
export const hasResults = (election: Election): boolean =>
  election.status === 'ENDED' && election.finalResults === true
