import { isResponseError } from 'up-fetch'

export class VocdoniApiError extends Error {
  status: number
  body: unknown
  /** Backend error code (the `code` field of the API error body), when present. */
  code?: number

  constructor(status: number, body: unknown, message: string, code?: number) {
    super(message)
    this.name = 'VocdoniApiError'
    this.status = status
    this.body = body
    this.code = code
  }
}

export function handleError(err: unknown): never {
  if (isResponseError(err)) {
    const data = (err.data ?? undefined) as Record<string, unknown> | undefined
    // The SaaS API returns errors as `{ error, code }`; older shapes used `message`.
    const message =
      data && typeof data === 'object'
        ? String(data.error ?? data.message ?? err.message)
        : err.message
    const code =
      data && typeof data.code === 'number' ? (data.code as number) : undefined
    throw new VocdoniApiError(err.status, err.data, message, code)
  }
  throw err
}
