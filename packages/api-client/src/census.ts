import type { Census, CensusMember, CreateCensusRequest } from '@vocdoni/api-types'
import type { UpFetch } from 'up-fetch'
import { handleError } from './errors'

export class CensusClient {
  constructor(private readonly fetch: UpFetch) {}

  async get(id: string): Promise<Census> {
    return this.fetch<Census>(`/census/${id}`).catch(handleError)
  }

  async create(data: CreateCensusRequest): Promise<Census> {
    return this.fetch<Census>('/census', {
      method: 'POST',
      body: data,
    }).catch(handleError)
  }

  async addMembers(id: string, members: CensusMember[]): Promise<void> {
    return this.fetch<void>(`/census/${id}/members`, {
      method: 'POST',
      body: members,
    }).catch(handleError)
  }
}
