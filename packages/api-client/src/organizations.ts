import type {
  AddMembersJobResponse,
  AddMembersResponse,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  CreateGroupRequest,
  CreateManagedOrganizationRequest,
  CreateOrganizationRequest,
  DeleteManagedOrganizationResponse,
  DeleteMembersRequest,
  DeleteMembersResponse,
  IntegratorInfo,
  JobsResponse,
  ListApiKeysResponse,
  ManagedOrganizationsResponse,
  Organization,
  OrganizationBundle,
  OrganizationCensusesResponse,
  OrganizationGroup,
  OrganizationGroupsResponse,
  OrganizationInfo,
  OrganizationMembersResponse,
  OrganizationMetaRequest,
  OrganizationMetaResponse,
  OrganizationProcessDraftsResponse,
  OrganizationRole,
  OrganizationSubscriptionInfo,
  OrganizationType,
  OrgMember,
  SubscriptionPlan,
  UpdateGroupRequest,
  ValidateGroupRequest,
} from '@vocdoni/api-types'
import type { UpFetch } from 'up-fetch'
import { handleError } from './errors'

export interface WaitForMembersJobOptions {
  /** Poll interval in ms. Default 1000. */
  intervalMs?: number
  /** Max time to wait before giving up, in ms. Default 60000. */
  timeoutMs?: number
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export class OrganizationsClient {
  constructor(private readonly fetch: UpFetch) {}

  // ─── Organizations ────────────────────────────────────────────────────────

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

  // ─── Integrator / managed organizations ───────────────────────────────────

  async getIntegratorInfo(): Promise<IntegratorInfo> {
    return this.fetch<IntegratorInfo>('/integrator').catch(handleError)
  }

  async listManaged(page?: number): Promise<ManagedOrganizationsResponse> {
    return this.fetch<ManagedOrganizationsResponse>('/integrator/organizations', {
      params: page !== undefined ? { page } : undefined,
    }).catch(handleError)
  }

  async createManaged(data: CreateManagedOrganizationRequest): Promise<OrganizationInfo> {
    return this.fetch<OrganizationInfo>('/integrator/organizations', {
      method: 'POST',
      body: data,
    }).catch(handleError)
  }

  async deleteManaged(orgAddress: string): Promise<DeleteManagedOrganizationResponse> {
    return this.fetch<DeleteManagedOrganizationResponse>(
      `/integrator/organizations/${orgAddress}`,
      { method: 'DELETE' },
    ).catch(handleError)
  }

  // ─── Members (memberbase) ──────────────────────────────────────────────────

  async listMembers(address: string, page?: number): Promise<OrganizationMembersResponse> {
    return this.fetch<OrganizationMembersResponse>(`/organizations/${address}/members`, {
      params: page !== undefined ? { page } : undefined,
    }).catch(handleError)
  }

  /** Add members to the org memberbase. Large batches run async (returns `jobId`). */
  async addMembers(address: string, members: OrgMember[]): Promise<AddMembersResponse> {
    return this.fetch<AddMembersResponse>(`/organizations/${address}/members`, {
      method: 'POST',
      body: { members },
    }).catch(handleError)
  }

  async upsertMember(address: string, member: OrgMember): Promise<OrgMember> {
    return this.fetch<OrgMember>(`/organizations/${address}/members`, {
      method: 'PUT',
      body: member,
    }).catch(handleError)
  }

  async deleteMembers(address: string, body: DeleteMembersRequest): Promise<DeleteMembersResponse> {
    return this.fetch<DeleteMembersResponse>(`/organizations/${address}/members`, {
      method: 'DELETE',
      body,
    }).catch(handleError)
  }

  async getMembersJob(address: string, jobId: string): Promise<AddMembersJobResponse> {
    return this.fetch<AddMembersJobResponse>(
      `/organizations/${address}/members/job/${jobId}`,
    ).catch(handleError)
  }

  /** Poll a member-add job until it reaches 100% progress. */
  async waitForMembersJob(
    address: string,
    jobId: string,
    opts: WaitForMembersJobOptions = {},
  ): Promise<AddMembersJobResponse> {
    const { intervalMs = 1000, timeoutMs = 60000 } = opts
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const job = await this.getMembersJob(address, jobId)
      if (job.progress >= 100) return job
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for members job ${jobId} after ${timeoutMs}ms`)
      }
      await sleep(intervalMs)
    }
  }

  // ─── Member groups ─────────────────────────────────────────────────────────

  async listGroups(address: string): Promise<OrganizationGroupsResponse> {
    return this.fetch<OrganizationGroupsResponse>(`/organizations/${address}/groups`).catch(
      handleError,
    )
  }

  async createGroup(address: string, body: CreateGroupRequest): Promise<OrganizationGroup> {
    return this.fetch<OrganizationGroup>(`/organizations/${address}/groups`, {
      method: 'POST',
      body,
    }).catch(handleError)
  }

  async getGroup(address: string, groupId: string): Promise<OrganizationGroup> {
    return this.fetch<OrganizationGroup>(`/organizations/${address}/groups/${groupId}`).catch(
      handleError,
    )
  }

  async updateGroup(address: string, groupId: string, body: UpdateGroupRequest): Promise<void> {
    return this.fetch<void>(`/organizations/${address}/groups/${groupId}`, {
      method: 'PUT',
      body,
    }).catch(handleError)
  }

  async deleteGroup(address: string, groupId: string): Promise<void> {
    return this.fetch<void>(`/organizations/${address}/groups/${groupId}`, {
      method: 'DELETE',
    }).catch(handleError)
  }

  async listGroupMembers(address: string, groupId: string): Promise<OrganizationMembersResponse> {
    return this.fetch<OrganizationMembersResponse>(
      `/organizations/${address}/groups/${groupId}/members`,
    ).catch(handleError)
  }

  async validateGroup(
    address: string,
    groupId: string,
    body: ValidateGroupRequest,
  ): Promise<void> {
    return this.fetch<void>(`/organizations/${address}/groups/${groupId}/validate`, {
      method: 'POST',
      body,
    }).catch(handleError)
  }

  // ─── Scoped reads ──────────────────────────────────────────────────────────

  async listCensuses(address: string): Promise<OrganizationCensusesResponse> {
    return this.fetch<OrganizationCensusesResponse>(`/organizations/${address}/censuses`).catch(
      handleError,
    )
  }

  async listBundles(address: string): Promise<OrganizationBundle[]> {
    return this.fetch<OrganizationBundle[]>(`/organizations/${address}/processes`).catch(handleError)
  }

  async listProcessDrafts(address: string): Promise<OrganizationProcessDraftsResponse> {
    return this.fetch<OrganizationProcessDraftsResponse>(
      `/organizations/${address}/processes/drafts`,
    ).catch(handleError)
  }

  async listJobs(address: string): Promise<JobsResponse> {
    return this.fetch<JobsResponse>(`/organizations/${address}/jobs`).catch(handleError)
  }

  async getSubscription(address: string): Promise<OrganizationSubscriptionInfo> {
    return this.fetch<OrganizationSubscriptionInfo>(
      `/organizations/${address}/subscription`,
    ).catch(handleError)
  }

  // ─── Meta ──────────────────────────────────────────────────────────────────

  async getMeta(address: string): Promise<OrganizationMetaResponse> {
    return this.fetch<OrganizationMetaResponse>(`/organizations/${address}/meta`).catch(handleError)
  }

  async addMeta(address: string, body: OrganizationMetaRequest): Promise<void> {
    return this.fetch<void>(`/organizations/${address}/meta`, {
      method: 'POST',
      body,
    }).catch(handleError)
  }

  async updateMeta(address: string, body: OrganizationMetaRequest): Promise<void> {
    return this.fetch<void>(`/organizations/${address}/meta`, {
      method: 'PUT',
      body,
    }).catch(handleError)
  }

  async deleteMeta(address: string): Promise<void> {
    return this.fetch<void>(`/organizations/${address}/meta`, { method: 'DELETE' }).catch(
      handleError,
    )
  }

  // ─── API keys (integrator) ─────────────────────────────────────────────────

  async listApiKeys(address: string): Promise<ListApiKeysResponse> {
    return this.fetch<ListApiKeysResponse>(`/organizations/${address}/apikeys`).catch(handleError)
  }

  async createApiKey(address: string, body: CreateApiKeyRequest): Promise<CreateApiKeyResponse> {
    return this.fetch<CreateApiKeyResponse>(`/organizations/${address}/apikeys`, {
      method: 'POST',
      body,
    }).catch(handleError)
  }

  async revokeApiKey(address: string, keyId: string): Promise<void> {
    return this.fetch<void>(`/organizations/${address}/apikeys/${keyId}`, {
      method: 'DELETE',
    }).catch(handleError)
  }

  // ─── Reference data ────────────────────────────────────────────────────────

  async listRoles(): Promise<OrganizationRole[]> {
    return this.fetch<OrganizationRole[]>('/organizations/roles').catch(handleError)
  }

  async listTypes(): Promise<OrganizationType[]> {
    return this.fetch<OrganizationType[]>('/organizations/types').catch(handleError)
  }

  async listPlans(): Promise<SubscriptionPlan[]> {
    return this.fetch<SubscriptionPlan[]>('/plans').catch(handleError)
  }
}
