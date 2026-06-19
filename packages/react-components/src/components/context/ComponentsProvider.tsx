import { createContext, ReactNode, useMemo } from 'react'
import { defaultComponents } from './default-components'
import { ComponentsDefinition, ComponentsPartialDefinition } from './types'

export const ComponentsContext = createContext<ComponentsDefinition | undefined>(undefined)

export type ComponentsProviderProps = {
  components?: ComponentsPartialDefinition
  children: ReactNode
}

export const ComponentsProvider = ({ components, children }: ComponentsProviderProps) => {
  const merged = useMemo(() => ({ ...defaultComponents, ...(components || {}) }), [components])

  return <ComponentsContext.Provider value={merged}>{children}</ComponentsContext.Provider>
}
