import { useComponents } from '../components/context/useComponents'
import { useConfirm } from './useConfirm'

export const ConfirmModal = () => {
  const { prompt, isOpen, cancel } = useConfirm()
  const { ConfirmShell: Shell } = useComponents()

  return <Shell isOpen={isOpen} onClose={() => cancel?.()} content={prompt} />
}
