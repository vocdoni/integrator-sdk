import { ComponentPropsWithoutRef } from 'react'
import { useComponents } from '../context/useComponents'
import { linkifyIpfs } from '../shared/ipfs'
import { useOrganization } from '@vocdoni/react-providers'

export const OrganizationAvatar = (props: ComponentPropsWithoutRef<'img'> & Record<string, unknown>) => {
  const { organization } = useOrganization()
  const { OrganizationAvatar: Slot } = useComponents()

  return <Slot {...props} src={linkifyIpfs(organization?.logo)} alt={organization?.name} />
}

export const OrganizationImage = OrganizationAvatar
