import { useComponents } from '../../context/useComponents'

export const QuestionsEmpty = () => {
  const { QuestionsEmpty: Slot } = useComponents()
  return <Slot text='Apparently this process has no questions 🤔' />
}
