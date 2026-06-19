import { useContext } from 'react'
import { ComponentsContext } from './ComponentsProvider'

export const useComponents = () => {
  const context = useContext(ComponentsContext)
  if (!context) {
    throw new Error('useComponents must be used within a <ComponentsProvider />')
  }
  return context
}
