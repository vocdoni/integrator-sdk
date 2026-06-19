import enReactComponents from './locales/en/react-components.json'

export const reactComponentsNamespace = 'react-components'
export const reactComponentsDefaultLanguage = 'en'

export const reactComponentsResources = {
  [reactComponentsDefaultLanguage]: {
    [reactComponentsNamespace]: enReactComponents,
  },
}

export type Locale = {
  [key: string]: string | Locale
}
