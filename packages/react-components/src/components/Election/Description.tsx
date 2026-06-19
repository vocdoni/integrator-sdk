import { ComponentPropsWithoutRef } from 'react'
import { useComponents } from '../context/useComponents'
import { useElection } from '@vocdoni/react-providers'
import { getElectionDescription } from '../../election/normalized'

export const ElectionDescription = (props: ComponentPropsWithoutRef<'div'> & Record<string, unknown>) => {
  const { election } = useElection()
  const { ElectionDescription: Slot } = useComponents()
  const description = getElectionDescription(election)

  if (!election || !description) {
    return null
  }

  return <Slot {...props} description={description} />
}
