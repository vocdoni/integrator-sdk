import latinize from 'latinize'

/**
 * Theoretically, all errors should be returned as strings, but this is not always true.
 * This utility properly casts them to strings.
 *
 * @param {any|unknown} error The error to be cast
 * @returns {string}
 */
export const errorToString = (error: any | unknown): string => {
  if (typeof error !== 'string' && 'data' in error && error.data && 'error' in error.data) {
    return error.data.error
  }
  if (typeof error !== 'string' && 'message' in error) {
    return error.message
  }
  if (typeof error !== 'string' && 'reason' in error) {
    return error.reason
  }

  return error
}

/**
 * Normalizes text removing spaces and latinizing characters, in order to reduce as much as possible
 * the possible inputs. So a text like "this is A TèXt" will end up as "thisisatext".
 *
 * @param text Text string to be normalized
 * @returns string
 */
export const normalizeText = (text?: string): string => {
  if (!text) return ''

  const result = text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\.·:]/g, '.')
    .replace(/[`´]/g, "'")
    .normalize()
    .toLowerCase()

  return latinize(result)
}
