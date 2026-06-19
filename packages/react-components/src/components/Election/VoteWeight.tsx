import { useComponents } from '../context/useComponents'
import { useReactComponentsLocalize } from '../../i18n/localize'
import { useElection } from '@vocdoni/react-providers'

export const VoteWeight = () => {
  const localize = useReactComponentsLocalize()
  const { VoteWeight: Slot } = useComponents()
  // VoteWeight is not implemented in the new API (no proof/weight endpoint).
  // Render nothing for now; consumers can override via ComponentsProvider.
  void useElection() // keep hook call for context validation

  if (true) return null

  return <Slot label={localize('vote.weight')} weight={0} />
}
