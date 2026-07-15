import { decodeQuestionResults } from '@vocdoni/ballot'
import { format } from 'date-fns'
import { ComponentPropsWithoutRef } from 'react'
import { useComponents } from '../context/useComponents'
import { linkifyIpfs } from '../shared/ipfs'
import { useReactComponentsLocalize } from '../../i18n/localize'
import { useElection } from '@vocdoni/react-providers'
import { resolveTitle } from '../../election/normalized'

const formatPercent = (pct: number | null) => (pct ?? 0).toFixed(1) + '%'

export type ElectionResultsProps = ComponentPropsWithoutRef<'div'> & {
  forceRender?: boolean
}

export const ElectionResults = ({ forceRender, ...rest }: ElectionResultsProps) => {
  const { election, status, results } = useElection()
  const localize = useReactComponentsLocalize()
  const { ElectionResults: Slot } = useComponents()

  if (!election || status === 'CANCELED') return null

  // Secret-until-the-end: show placeholder if any question is still secret
  // and its results are not yet final.
  const anySecretNotFinal = election.questions.some((q, i) => {
    const qResults = results?.questions[i]
    return q.secretUntilTheEnd && !qResults?.finalResults && !forceRender
  })

  if (anySecretNotFinal) {
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

  const questions = election.questions.map((question, qIdx: number) => {
    const rawResults = results?.questions[qIdx]?.results ?? []
    const decoded = decodeQuestionResults(question, rawResults)
    const choiceByValue = new Map(question.choices.map((choice) => [choice.value, choice]))

    return {
      title: localize('results.title', { title: resolveTitle(question.title) }),
      choices: decoded.map((row) => {
        if (row.choice === 'abstain') {
          return {
            title: localize('vote.abstain'),
            votes: String(row.votes),
            percent: formatPercent(row.percentage),
            image: undefined,
          }
        }

        const choice = choiceByValue.get(row.choice)
        const meta = (choice as any)?.meta ?? {}
        const image = meta?.image?.default as string | undefined

        return {
          title: choice ? resolveTitle(choice.title) : String(row.choice),
          votes: String(row.votes),
          percent: formatPercent(row.percentage),
          image: linkifyIpfs(image),
        }
      }),
    }
  })

  return <Slot {...rest} questions={questions} />
}
