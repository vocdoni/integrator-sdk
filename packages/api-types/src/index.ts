export type ElectionStatus = 'READY' | 'PAUSED' | 'ENDED' | 'CANCELED' | 'UPCOMING'

export interface Election {
  id: string
  title: Record<string, string>
  description: Record<string, string>
  status: ElectionStatus
  startDate: string
  endDate: string
  organizationId: string
  voteCount: number
  finalResults: boolean
  results?: number[][]
}

export interface Organization {
  address: string
  name: string
  description: string
  website?: string
  logo?: string
}

export interface Census {
  id: string
  type: 'spreadsheet' | 'api' | 'csp'
  size: number
}

export interface AuthToken {
  token: string
  expiresAt: string
  refresh: string
}
