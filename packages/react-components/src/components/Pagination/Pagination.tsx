import { usePagination } from '../../pagination/PaginationProvider'
import { Button } from './Button'
import { PaginationButtons, PaginationProps } from './shared'

export type { PaginationProps } from './shared'

export const Pagination = ({ maxButtons = 10, buttonProps, inputProps, pagination, ...rest }: PaginationProps) => {
  const { page, setPage, initialPage = 0 } = usePagination()

  const totalPages = initialPage === 0 ? pagination.lastPage + 1 : pagination.lastPage
  const currentPage = initialPage === 0 ? page - 1 : page

  return (
    <PaginationButtons
      goToPage={(nextPage) => setPage(nextPage)}
      createPageButton={(i) => {
        const pageIndex = initialPage === 0 ? i : i + initialPage
        return (
          <Button key={i} onClick={() => setPage(pageIndex)} isActive={currentPage === pageIndex} {...buttonProps}>
            {i + 1}
          </Button>
        )
      }}
      currentPage={currentPage}
      totalPages={totalPages}
      totalItems={pagination.totalItems}
      maxButtons={maxButtons}
      buttonProps={buttonProps}
      inputProps={inputProps}
      {...rest}
    />
  )
}
