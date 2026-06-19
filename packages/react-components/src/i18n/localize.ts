import { useTranslation } from 'react-i18next'
import { reactComponentsNamespace } from './locales'

export const useReactComponentsLocalize = () => {
  const { t } = useTranslation(reactComponentsNamespace)
  return (key: string, substitutions?: Record<string, unknown>) => t(key, substitutions)
}
