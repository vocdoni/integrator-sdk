import { ComponentPropsWithoutRef, useState } from 'react'
import { useComponents } from '../context/useComponents'
import { useReactComponentsLocalize } from '../../i18n/localize'

export type EllipsisButtonProps = ComponentPropsWithoutRef<'button'> & {
  gotoPage: (page: number) => void
  inputProps?: ComponentPropsWithoutRef<'input'>
}

export const EllipsisButton = ({ gotoPage, inputProps, ...rest }: EllipsisButtonProps) => {
  const [isInput, setIsInput] = useState(false)
  const { PaginationEllipsisButton: Slot } = useComponents()
  const localize = useReactComponentsLocalize()

  return (
    <Slot
      className={rest.className}
      isInput={isInput}
      placeholder={localize('pagination.page_placeholder')}
      onToggle={() => setIsInput((v) => !v)}
      onSubmitPage={(page) => {
        gotoPage(page)
        setIsInput(false)
      }}
      buttonProps={rest}
      inputProps={isInput ? inputProps : undefined}
    />
  )
}
