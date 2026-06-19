import { ComponentPropsWithoutRef } from 'react'
import { useComponents } from '../context/useComponents'

export type ButtonProps = ComponentPropsWithoutRef<'button'> & {
  isActive?: boolean
  href?: string
} & Record<string, unknown>

export const Button = ({ isActive, ...props }: ButtonProps) => {
  const { PaginationButton: Slot } = useComponents()
  return <Slot {...props} isActive={isActive} label={props.children} />
}

export const PaginationButton = Button
