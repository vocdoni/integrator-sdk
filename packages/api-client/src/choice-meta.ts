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

/**
 * Build a {@link ChoiceMeta} from one raw `metadata.choices` entry, or undefined
 * if it carries nothing beyond its `value` join key.
 *
 * `description` and `image` are the SDK-recognized keys and get validated (a
 * non-string description, an unusable image) — everything else the creator
 * stored is passed through untouched, so a custom `QuestionChoice` slot sees
 * the same open bag it would have got when meta lived on the choice directly.
 * `value` is dropped: it identifies the choice, it is not part of its meta.
 */
const toChoiceMeta = (entry: Record<string, unknown>): ChoiceMeta | undefined => {
  const { value: _value, description: rawDescription, image: rawImage, ...rest } = entry
  const description = typeof rawDescription === 'string' ? rawDescription : undefined
  const image = toChoiceImage(rawImage)

  const meta: ChoiceMeta = {
    ...rest,
    ...(description !== undefined && { description }),
    ...(image !== undefined && { image }),
  }

  return Object.keys(meta).length > 0 ? meta : undefined
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
