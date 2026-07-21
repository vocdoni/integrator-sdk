import { encodeQuestionBallot } from '@vocdoni/ballot'
import { createContext, PropsWithChildren, useContext, useEffect } from 'react'
import { FieldValues, FormProvider, useForm, UseFormReturn } from 'react-hook-form'
import { EnsureConfirmProvider } from '../../../confirm/ConfirmProvider'
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

// Mounts its own ConfirmProvider when the app doesn't provide one, so the
// vote-confirmation dialog works out of the box.
export const QuestionsFormProvider = (props: PropsWithChildren<QuestionsFormProviderProps>) => (
  <EnsureConfirmProvider>
    <QuestionsFormProviderInner {...props} />
  </EnsureConfirmProvider>
)

const QuestionsFormProviderInner = ({ children }: PropsWithChildren<QuestionsFormProviderProps>) => {
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

    // Build per-question raw selections from the form values.
    const selections = election.questions.map((_q, index) => {
      const raw = values[index.toString()]
      if (Array.isArray(raw)) return raw.map((value) => parseInt(value, 10))
      if (raw === undefined || raw === '') return []
      return [parseInt(raw, 10)]
    })

    // Encode each question's ballot using its own ballot protocol.
    const encodedBallots = election.questions.map((q, i) =>
      encodeQuestionBallot(q, selections[i] ?? [])
    )

    return baseVote(encodedBallots)
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
