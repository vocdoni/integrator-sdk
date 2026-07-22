import i18next, { type i18n, type InitOptions } from 'i18next'
import { initReactI18next } from 'react-i18next'
import {
  reactComponentsDefaultLanguage,
  reactComponentsNamespace,
  reactComponentsResources,
} from './locales'

/**
 * Creates an isolated i18next instance for tests. Always init i18next through
 * this wrapper in tests — it forces `showSupportNotice: false`, which silences
 * the Locize promotional message i18next prints to console.info on init.
 */
export function createTestI18n(options: InitOptions = {}): i18n {
  const instance = i18next.createInstance()
  instance.use(initReactI18next).init({
    lng: reactComponentsDefaultLanguage,
    fallbackLng: reactComponentsDefaultLanguage,
    ns: [reactComponentsNamespace],
    defaultNS: reactComponentsNamespace,
    resources: reactComponentsResources,
    interpolation: { escapeValue: false },
    ...options,
    // Never show the "made possible by Locize" ad in test output, regardless
    // of what callers pass in.
    showSupportNotice: false,
  })
  return instance
}
