import type { Choice } from '@vocdoni/api-types'
import { ComponentPropsWithoutRef } from 'react'
import { QuestionChoicePresentation, QuestionSelectionMode } from '../../context/types'
import { useComponents } from '../../context/useComponents'
import { linkifyIpfs } from '../../shared/ipfs'
import { resolveTitle } from '../../../election/normalized'

export type QuestionChoiceMeta = {
  image?: {
    default?: string
    thumbnail?: string
  }
  description?: string
}

const toNonEmpty = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined

export const getQuestionChoiceMeta = (choice: Choice): QuestionChoiceMeta => {
  const meta = ((choice as any).meta ?? {}) as {
    image?: { default?: string; thumbnail?: string }
    description?: string
  }

  const imageDefault = toNonEmpty(meta.image?.default)
  const imageThumbnail = toNonEmpty(meta.image?.thumbnail)
  const description = toNonEmpty(meta.description)
  const normalizedDefault = linkifyIpfs(imageDefault)
  const normalizedThumbnail = linkifyIpfs(imageThumbnail)

  const image =
    normalizedDefault || normalizedThumbnail
      ? { default: normalizedDefault, thumbnail: normalizedThumbnail }
      : undefined

  return {
    image,
    description,
  }
}

export const hasExtendedChoiceMeta = (choice: Choice): boolean => {
  const { image, description } = getQuestionChoiceMeta(choice)
  return Boolean(description || image?.default || image?.thumbnail)
}

export const QuestionChoice = ({
  choice,
  value,
  compact,
  dataAttrs,
  selectionMode,
  presentation,
  selected,
  disabled,
  controlType,
  onSelect,
  ...rest
}: ComponentPropsWithoutRef<'label'> & {
  choice: Choice
  value: string
  compact: boolean
  dataAttrs?: { [key: string]: string | undefined }
  selectionMode: QuestionSelectionMode
  presentation: QuestionChoicePresentation
  selected: boolean
  disabled?: boolean
  controlType: 'checkbox' | 'radio'
  onSelect: (checked: boolean) => void
}) => {
  const { QuestionChoice: Slot } = useComponents()
  const metadata = getQuestionChoiceMeta(choice)
  const hasImage = Boolean(metadata.image?.default || metadata.image?.thumbnail)
  const canOpenImageModal = Boolean(metadata.image?.thumbnail && metadata.image?.default)

  return (
    <Slot
      {...rest}
      choice={choice}
      value={value}
      label={resolveTitle(choice.title)}
      description={metadata.description}
      image={metadata.image}
      compact={compact}
      hasImage={hasImage}
      canOpenImageModal={canOpenImageModal}
      dataAttrs={dataAttrs}
      selectionMode={selectionMode}
      presentation={presentation}
      selected={selected}
      disabled={disabled}
      controlType={controlType}
      onSelect={onSelect}
    />
  )
}
