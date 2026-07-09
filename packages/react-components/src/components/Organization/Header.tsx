import { ComponentPropsWithoutRef } from 'react'
import { resolveTitle } from '../../election/normalized'
import { useComponents } from '../context/useComponents'
import { useOrganization } from '@vocdoni/react-providers'

export const OrganizationHeader = (props: ComponentPropsWithoutRef<'img'>) => {
  const { organization } = useOrganization()
  const { OrganizationAvatar: Slot } = useComponents()

  return <Slot {...props} src={resolveTitle(organization?.logo)} alt={resolveTitle(organization?.name)} />
}
