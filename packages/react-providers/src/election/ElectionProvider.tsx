import type { Election } from '@vocdoni/api-types'
import { CspAuth, VotingClient } from '@vocdoni/api-voting'
import { useQuery } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { useClient } from '../client/ClientProvider'

export interface ElectionContextValue {
  election: Election | null
  loading: boolean
  error: Error | null

  cspToken: string | null
  cspStep0(data?: unknown): Promise<void>
  cspStep1(authData?: unknown): Promise<void>

  /** true when the voter has completed CSP authentication */
  connected: boolean
  /** Voter weight from census; populated after CSP check */
  weight: number | null
  clearVoter(): void

  vote(choices: number[]): Promise<string>
  voteId: string | null
  isAbleToVote: boolean
  hasVoted: boolean
}

export interface ElectionProviderProps {
  children: ReactNode
  /** Election ID — fetches the election on mount */
  id: string
}

const ElectionContext = createContext<ElectionContextValue | undefined>(undefined)

export function ElectionProvider({ children, id }: ElectionProviderProps) {
  const { client } = useClient()

  const {
    data: election = null,
    isLoading: loading,
    error,
  } = useQuery<Election, Error>({
    queryKey: ['election', id],
    queryFn: () => client.elections.get(id),
    enabled: !!id,
  })

  const [cspStep0Token, setCspStep0Token] = useState<string | null>(null)
  const [cspToken, setCspToken] = useState<string | null>(null)
  const [weight, setWeight] = useState<number | null>(null)
  const [voteId, setVoteId] = useState<string | null>(null)
  const [hasVoted, setHasVoted] = useState(false)

  const cspStep0 = useCallback(
    async (data?: unknown) => {
      if (!election?.census?.uri) throw new Error('Election census URI not available')
      const cspAuth = new CspAuth(election.census.uri)
      const res = await cspAuth.step0(data)
      setCspStep0Token(res.authToken)
    },
    [election],
  )

  const cspStep1 = useCallback(
    async (authData?: unknown) => {
      if (!election?.census?.uri) throw new Error('Election census URI not available')
      if (!cspStep0Token) throw new Error('Must complete CSP step 0 first')
      const cspAuth = new CspAuth(election.census.uri)
      const res = await cspAuth.step1(cspStep0Token, authData)
      setCspToken(res.authToken)
      // Fetch weight alongside confirmation
      const check = await cspAuth.check(res.authToken, election.id)
      if (check.weight != null) setWeight(check.weight)
    },
    [election, cspStep0Token],
  )

  const clearVoter = useCallback(() => {
    setCspStep0Token(null)
    setCspToken(null)
    setWeight(null)
    setHasVoted(false)
    setVoteId(null)
  }, [])

  const vote = useCallback(
    async (choices: number[]): Promise<string> => {
      if (!election) throw new Error('Election not loaded')

      if (!cspToken) throw new Error('Must complete CSP authentication first')
      if (!election.census?.uri) throw new Error('Election census URI not available')

      const votingClient = new VotingClient()
      const resultVoteId = await votingClient.vote({
        electionId: election.id,
        censusUri: election.census.uri,
        choices,
        encryptionKeys: election.encryptionPublicKeys,
        cspAuthToken: cspToken,
        relayFn: (req) => client.elections.vote(election.id, req),
      })

      setVoteId(resultVoteId)
      setHasVoted(true)
      return resultVoteId
    },
    [election, cspToken, client.elections],
  )

  const connected = !!cspToken

  const value: ElectionContextValue = {
    election,
    loading,
    error,
    cspToken,
    cspStep0,
    cspStep1,
    connected,
    weight,
    clearVoter,
    vote,
    voteId,
    isAbleToVote: connected && !hasVoted,
    hasVoted,
  }

  return <ElectionContext.Provider value={value}>{children}</ElectionContext.Provider>
}

export function useElection(): ElectionContextValue {
  const ctx = useContext(ElectionContext)
  if (!ctx) {
    throw new Error(
      'useElection() must be used inside <ElectionProvider>. ' +
        'Make sure the component is wrapped in <ElectionProvider>.',
    )
  }
  return ctx
}
