import { usePagination } from '../../pagination/PaginationProvider'
import { Button } from './Button'
import { PaginationButtons, PaginationProps } from './shared'

export type { PaginationProps } from './shared'

export const Pagination = ({ maxButtons = 10, buttonProps, inputProps, pagination, ...rest }: PaginationProps) => {
  const { page, setPage } = usePagination()

  const totalPages = pagination.lastPage
  const currentPage = page - 1

  return (
    <PaginationButtons
      goToPage={(nextPage) => setPage(nextPage + 1)}
      createPageButton={(i) => (
        <Button key={i} onClick={() => setPage(i + 1)} isActive={currentPage === i} {...buttonProps}>
          {i + 1}
        </Button>
      )}
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
