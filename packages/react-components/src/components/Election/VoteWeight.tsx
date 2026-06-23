import { useComponents } from '../context/useComponents'
import { useReactComponentsLocalize } from '../../i18n/localize'
import { useElection } from '@vocdoni/react-providers'

export const VoteWeight = () => {
  const { weight, election } = useElection()
  const localize = useReactComponentsLocalize()
  const { VoteWeight: Slot } = useComponents()

  if (!weight || !election) return null

  return <Slot label={localize('vote.weight')} weight={weight} />
}
