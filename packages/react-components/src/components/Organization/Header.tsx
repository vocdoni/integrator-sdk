import { ComponentPropsWithoutRef } from 'react'
import { useComponents } from '../context/useComponents'
import { useOrganization } from '@vocdoni/react-providers'

export const OrganizationHeader = (props: ComponentPropsWithoutRef<'img'>) => {
  const { organization } = useOrganization()
  const { OrganizationAvatar: Slot } = useComponents()

  return <Slot {...props} src={organization?.logo} alt={organization?.name} />
}
