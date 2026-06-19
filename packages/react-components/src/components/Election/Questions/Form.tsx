import type { Election } from '@vocdoni/api-types'
import { createContext, PropsWithChildren, useContext, useEffect } from 'react'
import { FieldValues, FormProvider, useForm, UseFormReturn } from 'react-hook-form'
import { useConfirm } from '../../../confirm/useConfirm'
import { useElection } from '@vocdoni/react-providers'
import { QuestionsConfirmation } from './Confirmation'

export type QuestionsFormContextState = {
  fmethods: UseFormReturn<any>
  vote: (values: FieldValues) => Promise<string | false | void>
}

const QuestionsFormContext = createContext<QuestionsFormContextState | undefined>(undefined)

export const useQuestionsForm = () => {
  const context = useContext(QuestionsFormContext)
  if (!context) {
    throw new Error('useQuestionsForm must be used within a QuestionsFormProvider')
  }
  return context
}

export type QuestionsFormProviderProps = {}

// Determine vote type from election voteType fields
const getVoteTypeCategory = (election: Election): 'single' | 'multiple' | 'approval' => {
  // If maxCount > 1 and uniqueChoices, treat as multiple choice
  // If uniqueChoices false and maxCount is equal to choices length, treat as approval
  // Default to single
  const { maxCount, uniqueChoices } = election.voteType
  if (maxCount > 1) {
    return uniqueChoices ? 'multiple' : 'approval'
  }
  return 'single'
}

export const QuestionsFormProvider = ({ children }: PropsWithChildren<QuestionsFormProviderProps>) => {
  const fmethods = useForm()
  const { confirm } = useConfirm()
  const { election, vote: baseVote } = useElection()

  const vote = async (values: FieldValues) => {
    if (!election) {
      console.warn('vote attempt with no valid election defined')
      return false
    }

    if (!(await confirm(<QuestionsConfirmation election={election} answers={values} />))) {
      return false
    }

    const voteType = getVoteTypeCategory(election)
    let results: number[] = []

    switch (voteType) {
      case 'single':
        results = election.questions.map((_question, index) => parseInt(values[index.toString()], 10))
        break
      case 'multiple':
      case 'approval':
        results = ((Object.values(values).pop() || []) as string[]).map((value: string) => parseInt(value, 10))
        break
      default:
        throw new Error('Unknown or invalid election type')
    }

    return baseVote(results)
  }

  useEffect(() => {
    if (!election || !election.questions) return

    fmethods.reset({
      ...election.questions.reduce((acc, _question, index) => ({ ...acc, [index]: '' }), {}),
    })
  }, [election, fmethods])

  return (
    <FormProvider {...fmethods}>
      <QuestionsFormContext.Provider value={{ fmethods, vote }}>{children}</QuestionsFormContext.Provider>
    </FormProvider>
  )
}
