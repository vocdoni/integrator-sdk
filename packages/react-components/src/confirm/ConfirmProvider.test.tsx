import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithComponents } from '../test-utils'
import { ConfirmProvider } from './ConfirmProvider'
import { useConfirm } from './useConfirm'

// The prompt rendered inside the modal: wires the provider's proceed/cancel
// callbacks to buttons, like real confirmation content does.
const Prompt = () => {
  const { proceed, cancel } = useConfirm()
  return (
    <div>
      <span>Are you sure?</span>
      <button onClick={() => proceed?.()}>confirm</button>
      <button onClick={() => cancel?.()}>dismiss</button>
    </div>
  )
}

// A child that triggers confirm() and records what the promise resolves to.
const Trigger = ({ outcomes }: { outcomes: boolean[] }) => {
  const { confirm } = useConfirm()
  return <button onClick={() => confirm(<Prompt />).then((ok) => outcomes.push(ok))}>open</button>
}

function setup() {
  const outcomes: boolean[] = []
  const view = renderWithComponents(
    <ConfirmProvider>
      <Trigger outcomes={outcomes} />
    </ConfirmProvider>,
  )
  return { outcomes, view }
}

describe('ConfirmProvider (real provider, no mocks)', () => {
  it('renders nothing until confirm() is called, then shows the prompt in a modal', () => {
    setup()
    expect(screen.queryByRole('dialog')).toBeNull()

    act(() => {
      fireEvent.click(screen.getByText('open'))
    })

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Are you sure?')).toBeInTheDocument()
  })

  it('proceed resolves the confirm() promise with true and closes the modal', async () => {
    const { outcomes } = setup()

    act(() => {
      fireEvent.click(screen.getByText('open'))
    })
    act(() => {
      fireEvent.click(screen.getByText('confirm'))
    })

    await waitFor(() => expect(outcomes).toEqual([true]))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('cancel resolves the confirm() promise with false and closes the modal', async () => {
    const { outcomes } = setup()

    act(() => {
      fireEvent.click(screen.getByText('open'))
    })
    act(() => {
      fireEvent.click(screen.getByText('dismiss'))
    })

    await waitFor(() => expect(outcomes).toEqual([false]))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('clicking the overlay closes via onClose → cancel (resolves false)', async () => {
    const { outcomes } = setup()

    act(() => {
      fireEvent.click(screen.getByText('open'))
    })
    // The default ConfirmShell overlay carries role="presentation" and cancels on click.
    act(() => {
      fireEvent.click(screen.getByRole('presentation'))
    })

    await waitFor(() => expect(outcomes).toEqual([false]))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
