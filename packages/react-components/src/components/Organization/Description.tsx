import { ComponentPropsWithoutRef } from 'react'
import { resolveTitle } from '../../election/normalized'
import { useComponents } from '../context/useComponents'
import { useOrganization } from '@vocdoni/react-providers'

export const OrganizationDescription = (props: ComponentPropsWithoutRef<'div'> & Record<string, unknown>) => {
  const { organization } = useOrganization()
  const { OrganizationDescription: Slot } = useComponents()

  const description = resolveTitle(organization?.description)
  if (!description) return null

  return <Slot {...props} description={description} />
}
