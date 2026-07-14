import { ComponentPropsWithoutRef, ReactElement, useMemo } from 'react'
import { useComponents } from '../context/useComponents'
import { useReactComponentsLocalize } from '../../i18n/localize'
import { Button, ButtonProps } from './Button'
import { EllipsisButton } from './EllipsisButton'

export type PaginationData = {
  lastPage: number
  totalItems?: number
}

type CreatePageButtonType = (i: number) => ReactElement
type GotoPageType = (page: number) => void

export type PaginationProps = ComponentPropsWithoutRef<'div'> &
  Record<string, unknown> & {
    maxButtons?: number | false
    buttonProps?: ButtonProps
    inputProps?: ComponentPropsWithoutRef<'input'>
    pagination: PaginationData
  }

const usePaginationPages = (
  currentPage: number,
  totalPages: number,
  maxButtons: number | undefined | false,
  gotoPage: GotoPageType,
  createPageButton: CreatePageButtonType,
  inputProps?: ComponentPropsWithoutRef<'input'>,
  buttonProps?: ButtonProps
) =>
  useMemo(() => {
    const pages: ReactElement[] = []
    for (let i = 0; i < totalPages; i++) {
      pages.push(createPageButton(i))
    }

    if (!maxButtons || totalPages <= maxButtons) {
      return pages
    }

    const startEllipsis = (
      <EllipsisButton key='start-ellipsis' gotoPage={gotoPage} inputProps={inputProps} {...buttonProps} />
    )
    const endEllipsis = (
      <EllipsisButton key='end-ellipsis' gotoPage={gotoPage} inputProps={inputProps} {...buttonProps} />
    )

    const sideButtons = 2
    const availableButtons = maxButtons - sideButtons

    if (currentPage <= availableButtons / 2) {
      return [...pages.slice(0, availableButtons), endEllipsis, pages[totalPages - 1]]
    }

    if (currentPage >= totalPages - 1 - availableButtons / 2) {
      return [pages[0], startEllipsis, ...pages.slice(totalPages - availableButtons, totalPages)]
    }

    const startPage = currentPage - Math.floor((availableButtons - 1) / 2)
    const endPage = currentPage + Math.floor(availableButtons / 2)
    return [pages[0], startEllipsis, ...pages.slice(startPage, endPage - 1), endEllipsis, pages[totalPages - 1]]
  }, [totalPages, maxButtons, gotoPage, inputProps, buttonProps, currentPage, createPageButton])

export const PaginationButtons = ({
  totalPages,
  totalItems,
  currentPage,
  goToPage,
  createPageButton,
  maxButtons = 10,
  buttonProps,
  inputProps,
  ...rest
}: {
  totalPages: number
  totalItems: number | undefined
  currentPage: number
  createPageButton: CreatePageButtonType
  goToPage: GotoPageType
  maxButtons?: number | false
  buttonProps?: ButtonProps
  inputProps?: ComponentPropsWithoutRef<'input'>
} & ComponentPropsWithoutRef<'div'>) => {
  const { PaginationContainer, PaginationSummary } = useComponents()
  const t = useReactComponentsLocalize()

  const pages = usePaginationPages(
    currentPage,
    totalPages,
    maxButtons ? Math.max(5, maxButtons) : false,
    (page) => {
      if (page >= 0 && page < totalPages) {
        goToPage(page)
      }
    },
    createPageButton,
    inputProps,
    buttonProps
  )

  return (
    <PaginationContainer
      {...rest}
      items={
        <>
          {pages}
          {Boolean(totalItems) ? (
            <PaginationSummary
              text={t('pagination.total_results', {
                count: totalItems,
              })}
            />
          ) : null}
        </>
      }
    />
  )
}
