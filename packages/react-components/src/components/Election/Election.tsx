import { ElectionProvider, ElectionProviderProps, useElection } from '@vocdoni/react-providers'
import { useComponents } from '../context/useComponents'
import { ElectionActions } from './Actions'
import { ElectionDescription } from './Description'
import { ElectionHeader } from './Header'
import { ElectionQuestions } from './Questions'
import { ElectionResults } from './Results'
import { ElectionSchedule } from './Schedule'
import { ElectionStatusBadge } from './StatusBadge'
import { ElectionTitle } from './Title'
import { VoteButton } from './VoteButton'

export const Election = (props: ElectionProviderProps) => (
  <ElectionProvider {...props}>
    <ElectionBody />
  </ElectionProvider>
)

const ElectionBody = () => {
  const { error, election } = useElection()
  const { HR } = useComponents()

  if (error) {
    return <p>{error.message}</p>
  }

  return (
    <>
      <ElectionHeader />
      <ElectionTitle />
      <ElectionSchedule />
      <ElectionStatusBadge />
      <ElectionActions />
      <ElectionDescription />
      <HR />
      <ElectionQuestions />
      <VoteButton />
      <ElectionResults />
    </>
  )
}
