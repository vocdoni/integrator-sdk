import { useRoutedPagination } from '../../pagination/RoutedPaginationProvider'
import { Button } from './Button'
import { PaginationButtons, PaginationProps } from './shared'

export const RoutedPagination = ({
  maxButtons = 10,
  buttonProps,
  inputProps,
  pagination,
  ...rest
}: PaginationProps) => {
  const { getPathForPage, setPage, page } = useRoutedPagination()

  const totalPages = pagination.lastPage
  const currentPage = page - 1

  return (
    <PaginationButtons
      goToPage={(nextPage) => setPage(nextPage + 1)}
      createPageButton={(i) => (
        <Button key={i} href={getPathForPage(i + 1)} isActive={currentPage === i} {...buttonProps}>
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
