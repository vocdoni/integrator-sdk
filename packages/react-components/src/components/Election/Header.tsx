import { ComponentPropsWithoutRef } from 'react'
import { useComponents } from '../context/useComponents'
import { linkifyIpfs } from '../shared/ipfs'
import { useElection } from '@vocdoni/react-providers'
import { getElectionTitle } from '../../election/normalized'

export const ElectionHeader = (props: ComponentPropsWithoutRef<'img'>) => {
  const { election } = useElection()
  const { ElectionHeader: Slot } = useComponents()

  if (!election) return null

  return <Slot {...props} src={linkifyIpfs(election.header)} alt={getElectionTitle(election)} />
}
