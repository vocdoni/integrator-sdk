import { ComponentPropsWithoutRef } from 'react'
import { resolveTitle } from '../../election/normalized'
import { useComponents } from '../context/useComponents'
import { useOrganization } from '@vocdoni/react-providers'

export const OrganizationName = (props: ComponentPropsWithoutRef<'h1'> & Record<string, unknown>) => {
  const { organization } = useOrganization()
  const { OrganizationName: Slot } = useComponents()

  if (!organization) return null

  const name = resolveTitle(organization.name) || organization.address
  return <Slot {...props} name={name} />
}
