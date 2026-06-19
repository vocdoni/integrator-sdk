import { createContext, PropsWithChildren, useContext, useState } from 'react'
import type { PaginationData } from '../components/Pagination/shared'

export type PaginationContextProps = {
  page: number
  setPage: (page: number) => void
  initialPage?: number
  pagination: PaginationData
}

const PaginationContext = createContext<PaginationContextProps | undefined>(undefined)

export const usePagination = (): PaginationContextProps => {
  const context = useContext(PaginationContext)
  if (!context) {
    throw new Error('usePagination must be used within a PaginationProvider')
  }
  return context
}

export type PaginationProviderProps = {
  pagination: PaginationData
  initialPage?: number
}

export const PaginationProvider = ({
  pagination,
  initialPage = 0,
  ...rest
}: PropsWithChildren<PaginationProviderProps>) => {
  const [page, setPage] = useState<number>(initialPage)

  return <PaginationContext.Provider value={{ page, setPage, pagination, initialPage }} {...rest} />
}
