import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeElection, renderWithComponents } from '../../test-utils'

const state = vi.hoisted(() => ({ election: null as ReturnType<typeof makeElection> | null }))
vi.mock('@vocdoni/react-providers', () => ({ useElection: () => state }))

import { ElectionTitle } from './Title'

const Slot = ({ title }: any) => <h1 data-testid="title">{title}</h1>
const slots = { components: { ElectionTitle: Slot } }

describe('ElectionTitle', () => {
  it('renders a plain title', () => {
    state.election = makeElection({ title: 'My Election' })
    renderWithComponents(<ElectionTitle />, slots)
    expect(screen.getByTestId('title')).toHaveTextContent('My Election')
  })

  it('resolves an i18n title object', () => {
    state.election = makeElection({ title: { default: 'Localized' } })
    renderWithComponents(<ElectionTitle />, slots)
    expect(screen.getByTestId('title')).toHaveTextContent('Localized')
  })

  it('renders nothing without an election', () => {
    state.election = null
    const { container } = renderWithComponents(<ElectionTitle />, slots)
    expect(container).toBeEmptyDOMElement()
  })
})
