import { useMutation } from '@tanstack/react-query'
import { createContext, useCallback, useContext, type ReactNode } from 'react'
import { useClient } from '../client/ClientProvider'
import { useElection } from './ElectionProvider'

export interface ActionsContextValue {
  pause(): Promise<void>
  resume(): Promise<void>
  end(): Promise<void>
  cancel(): Promise<void>
  loading: boolean
  error: Error | null
}

export interface ActionsProviderProps {
  children: ReactNode
}

const ActionsContext = createContext<ActionsContextValue | undefined>(undefined)

export function ActionsProvider({ children }: ActionsProviderProps) {
  const { client } = useClient()
  const { election } = useElection()

  const mutation = useMutation<void, Error, 'ready' | 'paused' | 'ended' | 'canceled'>({
    mutationFn: async (status) => {
      if (!election) throw new Error('Election not loaded')
      // Status changes are async SaaS jobs; wait for the on-chain tx to complete.
      await client.elections.setStatusAndWait(election.id, { status })
    },
  })

  const pause = useCallback(() => mutation.mutateAsync('paused'), [mutation])
  const resume = useCallback(() => mutation.mutateAsync('ready'), [mutation])
  const end = useCallback(() => mutation.mutateAsync('ended'), [mutation])
  const cancel = useCallback(() => mutation.mutateAsync('canceled'), [mutation])

  const value: ActionsContextValue = {
    pause,
    resume,
    end,
    cancel,
    loading: mutation.isPending,
    error: mutation.error,
  }

  return <ActionsContext.Provider value={value}>{children}</ActionsContext.Provider>
}

export function useActions(): ActionsContextValue {
  const ctx = useContext(ActionsContext)
  if (!ctx) {
    throw new Error(
      'useActions() must be used inside <ActionsProvider> (which itself must be inside <ElectionProvider>). ' +
        'Make sure the component is wrapped correctly.',
    )
  }
  return ctx
}
