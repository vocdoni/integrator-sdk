import { isResponseError } from 'up-fetch'

export class VocdoniApiError extends Error {
  status: number
  body: unknown

  constructor(status: number, body: unknown, message: string) {
    super(message)
    this.name = 'VocdoniApiError'
    this.status = status
    this.body = body
  }
}

export function handleError(err: unknown): never {
  if (isResponseError(err)) {
    const message =
      err.data && typeof err.data === 'object' && 'message' in err.data
        ? String((err.data as Record<string, unknown>).message)
        : err.message
    throw new VocdoniApiError(err.status, err.data, message)
  }
  throw err
}
