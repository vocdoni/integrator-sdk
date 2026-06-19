// ─── Components ───────────────────────────────────────────────────────────────
export * from './components'

// ─── i18n ─────────────────────────────────────────────────────────────────────
export * from './i18n'

// ─── Component slot system ────────────────────────────────────────────────────
export { ComponentsProvider } from './components/context/ComponentsProvider'
export { composeComponents, defineComponent } from './components/context/helpers'
export type {
  AccountComponentsDefinition,
  ComponentsDefinition,
  ComponentsPartialDefinition,
  ElectionComponentsDefinition,
  OrganizationComponentsDefinition,
  PaginationComponentsDefinition,
} from './components/context/types'
export { useComponents } from './components/context/useComponents'

// ─── Pagination ───────────────────────────────────────────────────────────────
export { Pagination, type PaginationProps } from './components/Pagination/Pagination'
export { HR } from './components/shared/HR'
export {
  PaginationProvider,
  usePagination,
  type PaginationContextProps,
  type PaginationProviderProps,
} from './pagination/PaginationProvider'
export {
  RoutedPaginationProvider,
  useRoutedPagination,
  type RoutedPaginationContextProps,
  type RoutedPaginationProviderProps,
} from './pagination/RoutedPaginationProvider'

// ─── Confirm ──────────────────────────────────────────────────────────────────
export { ConfirmModal } from './confirm/ConfirmModal'
export { ConfirmProvider } from './confirm/ConfirmProvider'
export { useConfirm } from './confirm/useConfirm'

// ─── Utils ────────────────────────────────────────────────────────────────────
export { errorToString, normalizeText } from './utils'
export { linkifyIpfs } from './components/shared/ipfs'
export * from './browser'

// ─── Election helpers ─────────────────────────────────────────────────────────
export {
  getElectionDescription,
  getElectionField,
  getElectionStatus,
  getElectionTitle,
  isInvalidElectionLike,
  isPublishedElectionLike,
  resolveDescription,
  resolveTitle,
  type ElectionLike,
} from './election/normalized'

// ─── Re-export providers (so consumers only install this one package) ──────────
export {
  ClientProvider,
  useClient,
  type ClientContextValue,
  type ClientProviderProps,
} from '@vocdoni/react-providers'

export {
  AuthProvider,
  useAuth,
  type AuthContextValue,
  type AuthProviderProps,
} from '@vocdoni/react-providers'

export {
  OrganizationProvider,
  useOrganization,
  type OrganizationContextValue,
  type OrganizationProviderProps,
} from '@vocdoni/react-providers'

export {
  ElectionProvider,
  useElection,
  type ElectionContextValue,
  type ElectionProviderProps,
} from '@vocdoni/react-providers'

export {
  ActionsProvider,
  useActions,
  type ActionsContextValue,
  type ActionsProviderProps,
} from '@vocdoni/react-providers'
