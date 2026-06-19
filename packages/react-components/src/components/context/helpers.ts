import { ComponentProps, ComponentType } from 'react'
import { ComponentsDefinition, ComponentsPartialDefinition } from './types'

export const composeComponents = (
  ...partials: Array<ComponentsPartialDefinition | undefined>
): ComponentsPartialDefinition =>
  partials.reduce<ComponentsPartialDefinition>((acc, partial) => ({ ...acc, ...(partial || {}) }), {})

export const defineComponent = <
  K extends keyof ComponentsDefinition,
  UIProps extends object = {},
  T extends ComponentType<ComponentProps<ComponentsDefinition[K]> & UIProps> = ComponentType<
    ComponentProps<ComponentsDefinition[K]> & UIProps
  >
>(
  component: T
) => {
  return component
}
