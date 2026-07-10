import { encodeBallot } from '@vocdoni/ballot'
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

    // Map each question's form value into the per-question choice-value array that
    // encodeBallot expects. Single-choice fields hold a single value string; multi-
    // choice/approval fields hold an array of selected value strings. encodeBallot
    // then infers the ballot type and produces the correct on-chain vector — a dense
    // 0/1 vector for approval and abstain-sentinel padding for multichoice, replacing
    // the old hand-rolled (and, for approval, buggy) index-list encoding.
    const selections = election.questions.map((_question, index) => {
      const raw = values[index.toString()]
      if (Array.isArray(raw)) return raw.map((value) => parseInt(value, 10))
      if (raw === undefined || raw === '') return []
      return [parseInt(raw, 10)]
    })

    return baseVote(encodeBallot(election, selections))
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
