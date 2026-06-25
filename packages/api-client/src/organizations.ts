import type { CreateOrganizationRequest, IntegratorInfo, Organization } from '@vocdoni/api-types'
import type { UpFetch } from 'up-fetch'
import { handleError } from './errors'

export class OrganizationsClient {
  constructor(private readonly fetch: UpFetch) {}

  async get(address: string): Promise<Organization> {
    return this.fetch<Organization>(`/organizations/${address}`).catch(handleError)
  }

  async create(data: CreateOrganizationRequest): Promise<Organization> {
    return this.fetch<Organization>('/organizations', {
      method: 'POST',
      body: data,
    }).catch(handleError)
  }

  async update(address: string, data: Partial<CreateOrganizationRequest>): Promise<Organization> {
    return this.fetch<Organization>(`/organizations/${address}`, {
      method: 'PUT',
      body: data,
    }).catch(handleError)
  }

  async getIntegratorInfo(): Promise<IntegratorInfo> {
    return this.fetch<IntegratorInfo>('/integrator').catch(handleError)
  }

  async listManaged(page?: number): Promise<Organization[]> {
    return this.fetch<Organization[]>('/integrator/managed', {
      params: page !== undefined ? { page } : undefined,
    }).catch(handleError)
  }

  async createManaged(data: CreateOrganizationRequest): Promise<Organization> {
    return this.fetch<Organization>('/integrator/managed', {
      method: 'POST',
      body: data,
    }).catch(handleError)
  }
}
