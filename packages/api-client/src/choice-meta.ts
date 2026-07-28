import type { Choice, ChoiceMeta } from '@vocdoni/api-types'

/**
 * Anything with choices and a free-form metadata bag — a
 * {@link VotingProcessQuestion} or a {@link PublicQuestionResponse}.
 */
type QuestionLike = { choices?: Choice[]; metadata?: Record<string, unknown> }

/**
 * Normalize a stored `image` to the `{ default, thumbnail }` object the display
 * layer reads. The creation flows write a plain URL string, so both shapes
 * exist in stored data and both must keep working — this tolerates them on
 * read rather than migrating anything.
 *
 * Values are passed through verbatim (no trimming, no ipfs resolution): the
 * display layer owns that normalization.
 */
const toChoiceImage = (image: unknown): ChoiceMeta['image'] => {
  if (typeof image === 'string') return { default: image }
  if (typeof image !== 'object' || image === null) return undefined

  const { default: def, thumbnail } = image as { default?: unknown; thumbnail?: unknown }
  const normalized: { default?: string; thumbnail?: string } = {}
  if (typeof def === 'string') normalized.default = def
  if (typeof thumbnail === 'string') normalized.thumbnail = thumbnail

  return normalized.default !== undefined || normalized.thumbnail !== undefined ? normalized : undefined
}

/** Build a {@link ChoiceMeta} from one raw `metadata.choices` entry, or undefined if it carries nothing. */
const toChoiceMeta = (entry: Record<string, unknown>): ChoiceMeta | undefined => {
  const description = typeof entry.description === 'string' ? entry.description : undefined
  const image = toChoiceImage(entry.image)
  if (description === undefined && image === undefined) return undefined
  return { ...(description !== undefined && { description }), ...(image !== undefined && { image }) }
}

/**
 * Fold a question's `metadata.choices` entries onto its choices as
 * {@link Choice.meta}, matched on `value`.
 *
 * The API stores extended choice info (image, description) on the question —
 * `db.Choice` is `{Title, Value}` and has nowhere to put it — while the display
 * components read it off the choice. This is the read-side mapping between the
 * two; it runs at the client boundary so every read (and every refetch) carries
 * it.
 *
 * Choices with no matching entry, and entries matching no choice, are left
 * alone: a question without `metadata.choices` comes back untouched, so it
 * keeps rendering the basic presentation.
 */
export const normalizeQuestionChoiceMeta = <Q extends QuestionLike>(question: Q): Q => {
  const entries = question.metadata?.choices
  if (!Array.isArray(entries) || !question.choices?.length) return question

  // First entry wins for a duplicated value, so the mapping is stable
  // regardless of how the array was appended to.
  const metaByValue = new Map<number, ChoiceMeta>()
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) continue
    const { value } = entry as { value?: unknown }
    if (typeof value !== 'number' || metaByValue.has(value)) continue
    const meta = toChoiceMeta(entry as Record<string, unknown>)
    if (meta) metaByValue.set(value, meta)
  }
  if (metaByValue.size === 0) return question

  return {
    ...question,
    choices: question.choices.map((choice) => {
      const meta = metaByValue.get(choice.value)
      return meta ? { ...choice, meta } : choice
    }),
  }
}
