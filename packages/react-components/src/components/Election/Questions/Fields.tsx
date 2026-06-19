import type { Choice, Question } from '@vocdoni/api-types'
import { Controller, useFormContext } from 'react-hook-form'
import { QuestionChoicePresentation, QuestionLayout, QuestionSelectionMode } from '../../context/types'
import { useComponents } from '../../context/useComponents'
import { useReactComponentsLocalize } from '../../../i18n/localize'
import { useElection } from '@vocdoni/react-providers'
import { hasExtendedChoiceMeta, QuestionChoice } from './Choice'
import { QuestionTip } from './Tip'
import { resolveTitle } from '../../../election/normalized'

export type QuestionProps = {
  question: Question
  index: string
}

// Determine selection mode from voteType
const getSelectionMode = (maxCount: number): QuestionSelectionMode =>
  maxCount === 1 ? 'single' : 'multiple'

const getQuestionPresentation = (question: Question): QuestionChoicePresentation =>
  question.choices.some(hasExtendedChoiceMeta) ? 'extended' : 'basic'

const getQuestionLayout = (question: Question): QuestionLayout =>
  question.choices.some((choice) => Boolean((choice as any).meta?.image?.default)) ? 'grid' : 'list'

export const ElectionQuestion = ({ question, index }: QuestionProps) => {
  const { election } = useElection()
  const { ElectionQuestion: Slot } = useComponents()
  const {
    formState: { errors },
  } = useFormContext()
  const layout = getQuestionLayout(question)
  const hasExtendedChoices = question.choices.some(hasExtendedChoiceMeta)
  const selectionMode = election ? getSelectionMode(election.voteType.maxCount) : ('single' as const)
  const invalid = Boolean((errors as Record<string, unknown>)[index])
  const description = resolveTitle((question as any).description)

  return (
    <Slot
      question={question}
      index={index}
      layout={layout}
      invalid={invalid}
      hasExtendedChoices={hasExtendedChoices}
      selectionMode={selectionMode}
      title={resolveTitle(question.title)}
      description={description || undefined}
      fields={
        <FieldSwitcher
          question={question}
          index={index}
          layout={layout}
          presentation={getQuestionPresentation(question)}
        />
      }
      tip={<QuestionTip />}
    />
  )
}

const FieldSwitcher = (props: QuestionProps & { layout: QuestionLayout; presentation: QuestionChoicePresentation }) => {
  const { election } = useElection()
  if (!election) return null

  const maxCount = election.voteType.maxCount
  const uniqueChoices = election.voteType.uniqueChoices

  if (maxCount > 1 && uniqueChoices) {
    return <MultiChoice {...props} />
  }
  if (maxCount > 1 && !uniqueChoices) {
    return <ApprovalChoice {...props} />
  }
  return <SingleChoice {...props} />
}

const MultiChoice = ({
  index,
  question,
  layout,
  presentation,
}: QuestionProps & { layout: QuestionLayout; presentation: QuestionChoicePresentation }) => {
  const { election, isAbleToVote } = useElection()
  const t = useReactComponentsLocalize()
  const { control, trigger } = useFormContext()
  const { QuestionsError } = useComponents()

  if (!election) return null

  const maxCount = election.voteType.maxCount
  const disabled = election.status !== 'READY' || !isAbleToVote

  return (
    <Controller
      control={control}
      disabled={disabled}
      name={index}
      rules={{
        validate: (value: string[]) => {
          return (
            (value && value.length === maxCount) ||
            t('validation.choices_count', { count: maxCount })
          )
        },
      }}
      render={({ field, fieldState }) => {
        const currentValues: string[] = Array.isArray(field.value) ? field.value : []

        return (
          <>
            {question.choices.map((choice: Choice) => {
              const value = choice.value.toString()
              const maxSelected = currentValues.length >= maxCount && !currentValues.includes(value)

              return (
                <QuestionChoice
                  key={value}
                  choice={choice}
                  value={value}
                  controlType='checkbox'
                  selectionMode='multiple'
                  presentation={presentation}
                  compact={!Boolean((choice as any).meta?.image?.default) && layout === 'list'}
                  dataAttrs={{
                    'data-choice-card': '',
                    'data-choice-control': '',
                    'data-choice-body': '',
                    'data-choice-media': '',
                    'data-layout': layout,
                    'data-choice-id-base': `question-${index}-choice-${value}`,
                    'data-choice-field-name': field.name,
                  }}
                  selected={currentValues.includes(value)}
                  disabled={disabled || maxSelected}
                  onSelect={(checked) => {
                    if (checked && maxSelected) return

                    const next = checked
                      ? [...currentValues, value]
                      : currentValues.filter((currentValue) => currentValue !== value)

                    field.onChange(next)
                    trigger(index)
                  }}
                />
              )
            })}
            {fieldState.error?.message ? <QuestionsError error={fieldState.error.message} variant='field' /> : null}
          </>
        )
      }}
    />
  )
}

const ApprovalChoice = ({
  index,
  question,
  layout,
  presentation,
}: QuestionProps & { layout: QuestionLayout; presentation: QuestionChoicePresentation }) => {
  const { election, isAbleToVote } = useElection()
  const { control } = useFormContext()
  const { QuestionsError } = useComponents()
  const t = useReactComponentsLocalize()

  if (!election) return null

  const disabled = election.status !== 'READY' || !isAbleToVote

  return (
    <Controller
      control={control}
      disabled={disabled}
      name={index}
      rules={{
        validate: (value: string[]) =>
          (value && value.length > 0) || t('validation.at_least_one', { defaultValue: 'Select at least one option' }),
      }}
      render={({ field, fieldState }) => {
        const currentValues: string[] = Array.isArray(field.value) ? field.value : []
        return (
          <>
            {question.choices.map((choice: Choice) => {
              const value = choice.value.toString()
              return (
                <QuestionChoice
                  key={value}
                  choice={choice}
                  value={value}
                  controlType='checkbox'
                  selectionMode='multiple'
                  presentation={presentation}
                  compact={!Boolean((choice as any).meta?.image?.default) && layout === 'list'}
                  dataAttrs={{
                    'data-choice-card': '',
                    'data-choice-control': '',
                    'data-choice-body': '',
                    'data-choice-media': '',
                    'data-layout': layout,
                    'data-choice-id-base': `question-${index}-choice-${value}`,
                    'data-choice-field-name': field.name,
                  }}
                  selected={currentValues.includes(value)}
                  disabled={disabled}
                  onSelect={(checked) => {
                    const next = checked
                      ? [...currentValues, value]
                      : currentValues.filter((currentValue) => currentValue !== value)

                    field.onChange(next)
                  }}
                />
              )
            })}
            {fieldState.error?.message ? <QuestionsError error={fieldState.error.message} variant='field' /> : null}
          </>
        )
      }}
    />
  )
}

const SingleChoice = ({
  index,
  question,
  layout,
  presentation,
}: QuestionProps & { layout: QuestionLayout; presentation: QuestionChoicePresentation }) => {
  const { election, isAbleToVote } = useElection()
  const { control } = useFormContext()
  const { QuestionsError } = useComponents()
  const t = useReactComponentsLocalize()

  if (!election) return null

  const disabled = election.status !== 'READY' || !isAbleToVote

  return (
    <Controller
      control={control}
      disabled={disabled}
      name={index}
      rules={{ required: t('validation.required') }}
      render={({ field, fieldState }) => (
        <>
          {question.choices.map((choice: Choice) => (
            <QuestionChoice
              key={choice.value}
              choice={choice}
              value={choice.value.toString()}
              controlType='radio'
              selectionMode='single'
              presentation={presentation}
              compact={!Boolean((choice as any).meta?.image?.default) && layout === 'list'}
              dataAttrs={{
                'data-choice-card': '',
                'data-choice-control': '',
                'data-choice-body': '',
                'data-choice-media': '',
                'data-layout': layout,
              }}
              selected={field.value === choice.value.toString()}
              disabled={disabled}
              onSelect={(checked) => {
                if (!checked) return
                field.onChange(choice.value.toString())
              }}
            />
          ))}
          {fieldState.error?.message ? <QuestionsError error={fieldState.error.message} variant='field' /> : null}
        </>
      )}
    />
  )
}
