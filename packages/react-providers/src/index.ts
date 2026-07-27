// ─── Client ───────────────────────────────────────────────────────────────────
export {
  ClientProvider,
  useClient,
  type ClientContextValue,
  type ClientProviderProps,
} from './client/ClientProvider'

// ─── Auth ─────────────────────────────────────────────────────────────────────
export {
  AuthProvider,
  useAuth,
  type AuthContextValue,
  type AuthProviderProps,
} from './auth/AuthProvider'

// ─── Organization ─────────────────────────────────────────────────────────────
export {
  OrganizationProvider,
  useOrganization,
  type OrganizationContextValue,
  type OrganizationProviderProps,
} from './organization/OrganizationProvider'

// ─── Election ─────────────────────────────────────────────────────────────────
export {
  ElectionProvider,
  electionQueryKeys,
  PartialVoteError,
  useElection,
  type ElectionContextValue,
  type ElectionProviderBaseProps,
  type ElectionProviderProps,
} from './election/ElectionProvider'

export {
  useElectionAuth,
  type ElectionAuthContextValue,
  type ElectionSignResult,
} from './election/use-election-auth'

export {
  ActionsProvider,
  useActions,
  type ActionsContextValue,
  type ActionsProviderProps,
} from './election/ActionsProvider'
