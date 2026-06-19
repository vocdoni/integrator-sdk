import { useComponents } from '../../context/useComponents'

export const QuestionsError = ({ error }: { error: string }) => {
  const { QuestionsError: Slot } = useComponents()
  return <Slot error={error} />
}
