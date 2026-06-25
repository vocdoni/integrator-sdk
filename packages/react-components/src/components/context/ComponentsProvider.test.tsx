import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { ComponentsProvider } from './ComponentsProvider'
import { defaultComponents } from './default-components'
import { useComponents } from './useComponents'

const wrap =
  (components?: Parameters<typeof ComponentsProvider>[0]['components']) =>
  ({ children }: { children: ReactNode }) => (
    <ComponentsProvider components={components}>{children}</ComponentsProvider>
  )

describe('ComponentsProvider / useComponents', () => {
  it('exposes the default slots when nothing is overridden', () => {
    const { result } = renderHook(useComponents, { wrapper: wrap() })
    expect(result.current.ElectionStatusBadge).toBe(defaultComponents.ElectionStatusBadge)
    expect(result.current.VoteButton).toBe(defaultComponents.VoteButton)
  })

  it('merges partial overrides over the defaults', () => {
    const Custom = () => null
    const { result } = renderHook(useComponents, { wrapper: wrap({ VoteButton: Custom }) })
    expect(result.current.VoteButton).toBe(Custom)
    // untouched slot keeps its default
    expect(result.current.ElectionStatusBadge).toBe(defaultComponents.ElectionStatusBadge)
  })

  it('throws when useComponents() is used outside a provider', () => {
    expect(() => renderHook(useComponents)).toThrow(
      'useComponents must be used within a <ComponentsProvider />',
    )
  })
})
