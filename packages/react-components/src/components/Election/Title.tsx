import { ComponentPropsWithoutRef } from 'react'
import { useComponents } from '../context/useComponents'
import { useElection } from '@vocdoni/react-providers'
import { getElectionTitle } from '../../election/normalized'

export const ElectionTitle = (props: ComponentPropsWithoutRef<'h1'> & Record<string, unknown>) => {
  const { election } = useElection()
  const { ElectionTitle: Slot } = useComponents()

  if (!election) return null

  const title = getElectionTitle(election)
  return <Slot {...props} title={title} />
}
