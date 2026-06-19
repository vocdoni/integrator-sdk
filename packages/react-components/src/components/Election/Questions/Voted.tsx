import { ReactNode } from 'react'
import { useComponents } from '../../context/useComponents'
import { useReactComponentsLocalize } from '../../../i18n/localize'
import { useElection } from '@vocdoni/react-providers'

export const Voted = () => {
  const { voteId } = useElection()
  const { Voted: Slot } = useComponents()
  const t = useReactComponentsLocalize()

  if (!voteId) return null

  const description = t('vote.voted_description', { id: voteId })
  const parts = description.split(voteId)
  const descriptionContent: ReactNode =
    parts.length > 1
      ? parts.reduce<ReactNode[]>((acc, part, index) => {
          acc.push(part)
          if (index < parts.length - 1) {
            acc.push(
              <a key={`link-${index}`} href={voteId} target='_blank' rel='noreferrer'>
                {voteId}
              </a>
            )
          }
          return acc
        }, [])
      : description

  return <Slot title={t('vote.voted_title')} description={descriptionContent} />
}
