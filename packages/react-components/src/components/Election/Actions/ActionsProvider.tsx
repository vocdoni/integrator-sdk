import { PropsWithChildren } from 'react'
import { ActionsProvider as RActionsProvider } from '@vocdoni/react-providers'

export const ActionsProvider = ({ children }: PropsWithChildren) => <RActionsProvider>{children}</RActionsProvider>
