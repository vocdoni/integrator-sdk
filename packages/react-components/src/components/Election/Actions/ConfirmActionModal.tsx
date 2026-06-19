import { ComponentPropsWithoutRef } from 'react'
import { useComponents } from '../../context/useComponents'
import { useConfirm } from '../../../confirm/useConfirm'

export type ConfirmActionModalProps = ComponentPropsWithoutRef<'div'> & {
  title: string
  description: string
  confirm: string
  cancel: string
}

export const ConfirmActionModal = ({ title, description, confirm, cancel, ...rest }: ConfirmActionModalProps) => {
  const { proceed, cancel: cancelAction } = useConfirm()
  const { ConfirmActionModal: Slot } = useComponents()

  return (
    <Slot
      {...rest}
      title={title}
      description={description}
      confirm={confirm}
      cancel={cancel}
      onConfirm={() => proceed?.()}
      onCancel={() => cancelAction?.()}
    />
  )
}
