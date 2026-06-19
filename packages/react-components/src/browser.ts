export const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined'

export const getStorageItem = (key: string) => {
  if (!isBrowser()) return null

  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export const setStorageItem = (key: string, value: string) => {
  if (!isBrowser()) return

  try {
    window.localStorage.setItem(key, value)
  } catch {}
}

export const removeStorageItem = (key: string) => {
  if (!isBrowser()) return

  try {
    window.localStorage.removeItem(key)
  } catch {}
}

export const getLocationHash = () => {
  if (!isBrowser()) return ''

  return window.location.hash ? window.location.hash.slice(1) : ''
}

export const replaceLocationHash = (value: string) => {
  if (!isBrowser()) return

  document.location.hash = value
}

export const clearLocationHash = () => {
  if (!isBrowser()) return

  window.history.pushState({}, '', `${document.location.pathname}${document.location.search}`)
}

export const hasEthereumProvider = () => {
  if (!isBrowser()) return false
  return 'ethereum' in window
}

export const canUseWorkers = () => {
  return (
    typeof Worker !== 'undefined' &&
    typeof Blob !== 'undefined' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function'
  )
}
