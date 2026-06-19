import { ComponentPropsWithoutRef } from 'react'
import { useComponents } from '../context/useComponents'
import { useOrganization } from '@vocdoni/react-providers'

export const OrganizationDescription = (props: ComponentPropsWithoutRef<'div'> & Record<string, unknown>) => {
  const { organization } = useOrganization()
  const { OrganizationDescription: Slot } = useComponents()

  if (!organization?.description) return null

  return <Slot {...props} description={organization.description} />
}
