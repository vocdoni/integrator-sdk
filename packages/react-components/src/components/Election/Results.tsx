import type { Choice, Election, Question } from '@vocdoni/api-types'
import { format } from 'date-fns'
import { ComponentPropsWithoutRef } from 'react'
import { useComponents } from '../context/useComponents'
import { linkifyIpfs } from '../shared/ipfs'
import { useReactComponentsLocalize } from '../../i18n/localize'
import { useElection } from '@vocdoni/react-providers'
import { resolveTitle } from '../../election/normalized'

const percent = (result: number, total: number) => ((Number(result) / total) * 100 || 0).toFixed(1) + '%'

export type ElectionResultsProps = ComponentPropsWithoutRef<'div'> & {
  forceRender?: boolean
}

export const ElectionResults = ({ forceRender, ...rest }: ElectionResultsProps) => {
  const { election } = useElection()
  const localize = useReactComponentsLocalize()
  const { ElectionResults: Slot } = useComponents()

  if (!election || election.status === 'CANCELED') return null

  // Secret until the end: show placeholder text unless forceRender or results are final
  if (election.electionType.secretUntilTheEnd && !election.finalResults && !forceRender) {
    const endDate = election.endDate ? new Date(election.endDate) : null
    return (
      <Slot
        {...rest}
        secretText={localize('results.secret_until_the_end', {
          endDate: endDate ? format(endDate, localize('results.date_format')) : '',
        })}
      />
    )
  }

  // Parse results from the string[][] format
  const rawResults: string[][] = election.results ?? []

  const questions = election.questions.map((question: Question, qIdx: number) => {
    const questionResults: string[] = rawResults[qIdx] ?? []
    const totalVotes = questionResults.reduce((acc, r) => acc + Number(r), 0)

    return {
      title: localize('results.title', { title: resolveTitle(question.title) }),
      choices: question.choices.map((choice: Choice, cIdx: number) => {
        const votes = Number(questionResults[cIdx] ?? 0)
        const meta = (choice as any).meta ?? {}
        const image = meta?.image?.default as string | undefined

        return {
          title: resolveTitle(choice.title),
          votes: String(votes),
          percent: percent(votes, totalVotes),
          image: linkifyIpfs(image),
        }
      }),
    }
  })

  return <Slot {...rest} questions={questions} />
}
