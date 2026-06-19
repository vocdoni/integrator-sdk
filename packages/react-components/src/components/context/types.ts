import type { Choice, Election, Question } from '@vocdoni/api-types'
import { ComponentPropsWithoutRef, ComponentType, FormEvent, HTMLAttributes, ReactNode } from 'react'
import { FieldValues, UseFormRegisterReturn } from 'react-hook-form'

type BaseProps<T extends HTMLElement = HTMLElement> = Omit<HTMLAttributes<T>, 'children'>

export type ElectionTitleSlotProps = BaseProps<HTMLHeadingElement> & { title: string }
export type ElectionDescriptionSlotProps = BaseProps<HTMLDivElement> & { description: string }
export type ElectionScheduleSlotProps = BaseProps<HTMLParagraphElement> & { text: string }
export type ElectionStatusBadgeSlotProps = BaseProps<HTMLSpanElement> & {
  label: string
  tone: 'success' | 'warning' | 'danger'
}
export type ElectionHeaderSlotProps = BaseProps<HTMLImageElement> & { src?: string; alt?: string }
export type QuestionsTypeBadgeSlotProps = BaseProps<HTMLDivElement> & { title: string; tooltip?: string }
export type QuestionTipSlotProps = BaseProps<HTMLDivElement> & { text: string }
export type QuestionsEmptySlotProps = BaseProps<HTMLDivElement> & { text: string }
export type QuestionsErrorSlotProps = BaseProps<HTMLDivElement> & { error: string; variant?: 'field' | 'form' }
export type VotedSlotProps = BaseProps<HTMLDivElement> & { title: string; description: ReactNode }
export type VoteButtonSlotProps = BaseProps<HTMLButtonElement> & {
  label: ReactNode
  form?: string
  disabled?: boolean
  loading?: boolean
  type?: 'button' | 'submit'
  onClick?: () => void | Promise<void>
}
export type VoteWeightSlotProps = BaseProps<HTMLDivElement> & { label: string; weight: number }

export type ElectionResultChoice = {
  title: string
  votes: string
  percent: string
  description?: string
  image?: string
}

export type ElectionResultQuestion = {
  title: string
  choices: ElectionResultChoice[]
}

export type ElectionResultsSlotProps = BaseProps<HTMLDivElement> & {
  secretText?: string
  questions?: ElectionResultQuestion[]
}

export type SpreadsheetInputField = {
  id: string
  label: string
  description?: string
  error?: string
  inputProps: UseFormRegisterReturn
  inputAttrs?: {
    type?: string
    min?: number
    max?: number
  }
}

export type SpreadsheetAccessSlotProps = BaseProps<HTMLDivElement> & {
  connected: boolean
  loading: boolean
  formError?: string
  title: string
  open: boolean
  onOpen: () => void
  onClose: () => void
  onLogout: () => void
  onSubmit: (event?: FormEvent<HTMLFormElement>) => void
  fields: SpreadsheetInputField[]
  anonymousField?: SpreadsheetInputField
  extraFields?: ReactNode
}

export type ElectionActionsSlotProps = BaseProps<HTMLDivElement> & { actions?: ReactNode }

export type ActionButtonSlotProps = BaseProps<HTMLButtonElement> & {
  label: ReactNode
  disabled?: boolean
  loading?: boolean
  onClick?: () => void | Promise<void>
}

export type ConfirmActionModalSlotProps = BaseProps<HTMLDivElement> & {
  title: string
  description: string
  confirm: string
  cancel: string
  onConfirm: () => void
  onCancel: () => void
}
export type ConfirmShellSlotProps = Omit<BaseProps<HTMLDivElement>, 'content'> & {
  isOpen: boolean
  onClose: () => void
  content: ReactNode
}

export type AccountBalanceSlotProps = BaseProps<HTMLSpanElement> & {
  balance: number
  tone: 'success' | 'warning' | 'danger'
  label: string
}

export type PaginationContainerSlotProps = BaseProps<HTMLDivElement> & {
  items?: ReactNode
}

export type PaginationButtonSlotProps = {
  label?: ReactNode
  isActive?: boolean
  disabled?: boolean
  href?: string
  className?: string
  type?: 'button' | 'submit' | 'reset'
  onClick?: (...args: any[]) => void
}

export type PaginationEllipsisButtonSlotProps = {
  className?: string
  isInput: boolean
  placeholder: string
  onToggle: () => void
  onSubmitPage: (page: number) => void
  buttonProps?: ComponentPropsWithoutRef<'button'>
  inputProps?: ComponentPropsWithoutRef<'input'>
}

export type PaginationSummarySlotProps = BaseProps<HTMLParagraphElement> & {
  text: string
}

export type ElectionQuestionsSlotProps = BaseProps<HTMLDivElement> & { form?: ReactNode }
export type QuestionSelectionMode = 'single' | 'multiple'
export type QuestionChoicePresentation = 'basic' | 'extended'
export type QuestionLayout = 'list' | 'grid'

export type ElectionQuestionSlotProps = BaseProps<HTMLDivElement> & {
  question: Question
  index: string
  layout: QuestionLayout
  invalid: boolean
  hasExtendedChoices: boolean
  selectionMode: QuestionSelectionMode
  title: string
  description?: string
  fields: ReactNode
  tip?: ReactNode
}

export type QuestionChoiceSlotProps = BaseProps<HTMLLabelElement> & {
  choice: Choice
  value: string
  label: string
  description?: string
  image?: {
    default?: string
    thumbnail?: string
  }
  compact: boolean
  hasImage: boolean
  canOpenImageModal: boolean
  dataAttrs?: { [key: string]: string | undefined }
  presentation: QuestionChoicePresentation
  selectionMode: QuestionSelectionMode
  selected: boolean
  disabled?: boolean
  controlType: 'checkbox' | 'radio'
  onSelect: (checked: boolean) => void
}

export type QuestionsConfirmationAnswerItem = {
  question: string
  answers: string[]
}

export type QuestionsConfirmationSlotProps = BaseProps<HTMLDivElement> & {
  election: Election
  answers: FieldValues
  answersView: QuestionsConfirmationAnswerItem[]
  onConfirm: () => void
  onCancel: () => void
}

export type OrganizationNameSlotProps = BaseProps<HTMLHeadingElement> & { name: string }
export type OrganizationDescriptionSlotProps = BaseProps<HTMLDivElement> & { description: string }
export type OrganizationAvatarSlotProps = BaseProps<HTMLImageElement> & { src?: string; alt?: string }

export type ComponentsDefinition<ExternalProps extends object = {}> = {
  HR: ComponentType<BaseProps<HTMLHRElement> & ExternalProps>
  ElectionTitle: ComponentType<ElectionTitleSlotProps & ExternalProps>
  ElectionDescription: ComponentType<ElectionDescriptionSlotProps & ExternalProps>
  ElectionSchedule: ComponentType<ElectionScheduleSlotProps & ExternalProps>
  ElectionStatusBadge: ComponentType<ElectionStatusBadgeSlotProps & ExternalProps>
  ElectionHeader: ComponentType<ElectionHeaderSlotProps & ExternalProps>
  ElectionQuestions: ComponentType<ElectionQuestionsSlotProps & ExternalProps>
  ElectionQuestion: ComponentType<ElectionQuestionSlotProps & ExternalProps>
  QuestionChoice: ComponentType<QuestionChoiceSlotProps & ExternalProps>
  QuestionsTypeBadge: ComponentType<QuestionsTypeBadgeSlotProps & ExternalProps>
  QuestionTip: ComponentType<QuestionTipSlotProps & ExternalProps>
  QuestionsEmpty: ComponentType<QuestionsEmptySlotProps & ExternalProps>
  QuestionsError: ComponentType<QuestionsErrorSlotProps & ExternalProps>
  QuestionsConfirmation: ComponentType<QuestionsConfirmationSlotProps & ExternalProps>
  Voted: ComponentType<VotedSlotProps & ExternalProps>
  VoteButton: ComponentType<VoteButtonSlotProps & ExternalProps>
  VoteWeight: ComponentType<VoteWeightSlotProps & ExternalProps>
  ElectionResults: ComponentType<ElectionResultsSlotProps & ExternalProps>
  SpreadsheetAccess: ComponentType<SpreadsheetAccessSlotProps & ExternalProps>
  ElectionActions: ComponentType<ElectionActionsSlotProps & ExternalProps>
  ActionContinue: ComponentType<ActionButtonSlotProps & ExternalProps>
  ActionPause: ComponentType<ActionButtonSlotProps & ExternalProps>
  ActionEnd: ComponentType<ActionButtonSlotProps & ExternalProps>
  ActionCancel: ComponentType<ActionButtonSlotProps & ExternalProps>
  ConfirmActionModal: ComponentType<ConfirmActionModalSlotProps & ExternalProps>
  ConfirmShell: ComponentType<ConfirmShellSlotProps & ExternalProps>
  AccountBalance: ComponentType<AccountBalanceSlotProps & ExternalProps>
  PaginationContainer: ComponentType<PaginationContainerSlotProps & ExternalProps>
  PaginationButton: ComponentType<PaginationButtonSlotProps & ExternalProps>
  PaginationEllipsisButton: ComponentType<PaginationEllipsisButtonSlotProps & ExternalProps>
  PaginationSummary: ComponentType<PaginationSummarySlotProps & ExternalProps>
  OrganizationName: ComponentType<OrganizationNameSlotProps & ExternalProps>
  OrganizationDescription: ComponentType<OrganizationDescriptionSlotProps & ExternalProps>
  OrganizationAvatar: ComponentType<OrganizationAvatarSlotProps & ExternalProps>
}

export type ComponentsPartialDefinition<ExternalProps extends object = {}> = Partial<
  ComponentsDefinition<ExternalProps>
>

export type ElectionComponentsDefinition = Pick<
  ComponentsDefinition,
  | 'ElectionTitle'
  | 'ElectionDescription'
  | 'ElectionSchedule'
  | 'ElectionStatusBadge'
  | 'ElectionHeader'
  | 'ElectionQuestions'
  | 'ElectionQuestion'
  | 'QuestionChoice'
  | 'QuestionsTypeBadge'
  | 'QuestionTip'
  | 'QuestionsEmpty'
  | 'QuestionsError'
  | 'QuestionsConfirmation'
  | 'Voted'
  | 'VoteButton'
  | 'VoteWeight'
  | 'ElectionResults'
  | 'SpreadsheetAccess'
  | 'ElectionActions'
  | 'ActionContinue'
  | 'ActionPause'
  | 'ActionEnd'
  | 'ActionCancel'
  | 'ConfirmActionModal'
  | 'ConfirmShell'
>

export type OrganizationComponentsDefinition = Pick<
  ComponentsDefinition,
  'OrganizationName' | 'OrganizationDescription' | 'OrganizationAvatar'
>

export type PaginationComponentsDefinition = Pick<
  ComponentsDefinition,
  'PaginationContainer' | 'PaginationButton' | 'PaginationEllipsisButton' | 'PaginationSummary'
>

export type AccountComponentsDefinition = Pick<ComponentsDefinition, 'AccountBalance'>
