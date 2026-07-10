import type { Election, Question } from '@vocdoni/api-types'
import { decodeResults } from '@vocdoni/ballot'
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

  // Decode the raw string[][] histogram into per-choice tallies. `decodeResults` is
  // type-aware (single-choice / approval / multichoice / budget / quadratic) and, for
  // multichoice, appends a unified abstain bucket — so we render every ballot type
  // through one shape instead of the old positional read.
  const decoded = decodeResults(election)

  const questions = election.questions.map((question: Question, qIdx: number) => {
    const rows = decoded[qIdx] ?? []
    const choiceByValue = new Map(question.choices.map((choice) => [choice.value, choice]))

    return {
      title: localize('results.title', { title: resolveTitle(question.title) }),
      choices: rows.map((row) => {
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
