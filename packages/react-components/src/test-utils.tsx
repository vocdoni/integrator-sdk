import type { Election } from '@vocdoni/api-types'
import { render, type RenderOptions } from '@testing-library/react'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import type { ReactElement, ReactNode } from 'react'
import { ComponentsProvider } from './components/context/ComponentsProvider'
import type { ComponentsPartialDefinition } from './components/context/types'
import {
  reactComponentsDefaultLanguage,
  reactComponentsNamespace,
  reactComponentsResources,
} from './i18n/locales'

// A dedicated i18n instance preloaded with the package's English resources, so
// components render real labels ("Ongoing", "Vote", …) under test instead of
// raw keys. Created once and reused across the suite.
const testI18n = i18next.createInstance()
testI18n.use(initReactI18next).init({
  lng: reactComponentsDefaultLanguage,
  fallbackLng: reactComponentsDefaultLanguage,
  ns: [reactComponentsNamespace],
  defaultNS: reactComponentsNamespace,
  resources: reactComponentsResources,
  interpolation: { escapeValue: false },
})

export interface RenderWithComponentsOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Slot overrides — inject simple test slots to assert on the props a component emits. */
  components?: ComponentsPartialDefinition
}

/**
 * Renders `ui` inside the real i18n + component-slot providers. Pass `components`
 * to override individual slots with capture-friendly test implementations.
 *
 * Election/organization state is NOT provided here — mock `@vocdoni/react-providers`
 * in the test to control `useElection()` / `useOrganization()` / `useActions()`.
 */
export function renderWithComponents(
  ui: ReactElement,
  { components, ...options }: RenderWithComponentsOptions = {},
) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <I18nextProvider i18n={testI18n}>
      <ComponentsProvider components={components}>{children}</ComponentsProvider>
    </I18nextProvider>
  )
  return render(ui, { wrapper: Wrapper, ...options })
}

/** Builds a flat {@link Election} with sane defaults; override any field per test. */
export function makeElection(overrides: Partial<Election> = {}): Election {
  return {
    id: 'election-1',
    title: 'Test Election',
    status: 'READY',
    startDate: '2024-01-01T00:00:00Z',
    endDate: '2024-12-31T23:59:59Z',
    organizationId: 'org-1',
    voteCount: 0,
    finalResults: false,
    questions: [],
    voteType: {
      maxCount: 1,
      maxValue: 1,
      maxVoteOverwrites: 0,
      costExponent: 1,
      uniqueChoices: false,
      costFromWeight: false,
    },
    electionType: { interruptible: true, secretUntilTheEnd: false, anonymous: false },
    ...overrides,
  }
}
