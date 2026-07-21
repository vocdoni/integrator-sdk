import { createContext, ReactNode, useContext, useState } from 'react'
import { ConfirmModal } from './ConfirmModal'

type ConfirmState = {
  prompt: ReactNode | null
  isOpen: boolean
  proceed: null | (() => void)
  cancel: null | VoidFunction
}

type ConfirmContextValue = ConfirmState & {
  confirm: (prompt: ReactNode) => Promise<boolean>
}

const useConfirmProvider = (): ConfirmContextValue => {
  const [state, setState] = useState<ConfirmState>({
    prompt: null,
    isOpen: false,
    proceed: null,
    cancel: null,
  })

  const confirm = (prompt: ReactNode) =>
    new Promise<boolean>((resolve, reject) => {
      setState({
        prompt,
        isOpen: true,
        proceed: () => resolve(true),
        cancel: () => reject(),
      })
    }).then(
      () => {
        setState((prev) => ({ ...prev, isOpen: false }))
        return true
      },
      () => {
        setState((prev) => ({ ...prev, isOpen: false }))
        return false
      }
    )

  return { ...state, confirm }
}

export const ConfirmContext = createContext<ConfirmContextValue | undefined>(undefined)

export const ConfirmProvider = ({ children }: { children: ReactNode }) => {
  const value = useConfirmProvider()
  return (
    <ConfirmContext.Provider value={value}>
      <ConfirmModal />
      {children}
    </ConfirmContext.Provider>
  )
}

/**
 * Mounts a {@link ConfirmProvider} only when none is present above, so
 * components that call `useConfirm` work out of the box while an app-provided
 * provider (e.g. one mounted app-wide to share a single modal) still wins.
 */
export const EnsureConfirmProvider = ({ children }: { children: ReactNode }) => {
  const existing = useContext(ConfirmContext)
  if (existing) return <>{children}</>
  return <ConfirmProvider>{children}</ConfirmProvider>
}
