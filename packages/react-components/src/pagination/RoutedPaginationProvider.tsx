import { createContext, PropsWithChildren, useContext } from 'react'
import { generatePath, useLocation, useNavigate, useParams } from 'react-router-dom'
import type { PaginationData } from '../components/Pagination/shared'

export type RoutedPaginationContextProps = {
  page: number
  initialPage?: number
  path: string
  pagination: PaginationData
  getPathForPage: (page: number, queryParams?: string) => string
  setPage: (page: number, queryParams?: string) => void
}

const RoutedPaginationContext = createContext<RoutedPaginationContextProps | undefined>(undefined)

export const useRoutedPagination = (): RoutedPaginationContextProps => {
  const context = useContext(RoutedPaginationContext)
  if (!context) {
    throw new Error('useRoutedPagination must be used within a RoutedPaginationProvider')
  }
  return context
}

export type RoutedPaginationProviderProps = {
  path: string
  pagination: PaginationData
  initialPage?: number
}

export const RoutedPaginationProvider = ({
  path,
  pagination,
  initialPage = 0,
  ...rest
}: PropsWithChildren<RoutedPaginationProviderProps>) => {
  const { search } = useLocation()
  const { page, ...extraParams }: { page?: number } = useParams()
  const p = page && page > 0 ? Number(page) : 0

  const navigate = useNavigate()

  const getPathForPage = (page: number, queryParams?: string) => {
    const queryString = queryParams || search
    return generatePath(path, { page: String(page), ...extraParams }) + queryString
  }

  const setPage = (page: number, queryParams?: string) => {
    navigate(getPathForPage(page, queryParams))
  }

  return (
    <RoutedPaginationContext.Provider
      value={{ page: p, path, getPathForPage, setPage, pagination, initialPage }}
      {...rest}
    />
  )
}
