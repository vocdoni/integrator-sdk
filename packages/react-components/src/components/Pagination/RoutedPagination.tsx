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
  const { getPathForPage, setPage, page, initialPage = 0 } = useRoutedPagination()

  const totalPages = initialPage === 0 ? pagination.lastPage + 1 : pagination.lastPage
  const currentPage = initialPage === 0 ? page - 1 : page

  return (
    <PaginationButtons
      goToPage={(nextPage) => setPage(nextPage + 1)}
      createPageButton={(i) => {
        const pageIndex = initialPage === 0 ? i : i + initialPage
        return (
          <Button key={i} href={getPathForPage(i + 1)} isActive={currentPage === pageIndex} {...buttonProps}>
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
