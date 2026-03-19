'use client'

import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

type TaskType = 'training' | 'evaluation'
type BucketKey = 'chemrxiv' | 'dolma' | 'successful' | 'unsuccessful'

type RetrievedEntry = {
  rank?: number
  score?: number
  doc_id?: string
  text?: string
}

type ItemPayload = {
  query?: string
  passage?: string
  query_text?: string
  ground_truth_text?: string
  retrieved?: RetrievedEntry[]
}

type ReviewItem = {
  id: string
  task_type: TaskType
  subtask: string
  payload: ItemPayload
  order_index: number
}

type ReviewRow = {
  id: string
  item_id: string
  answerability: boolean | null
  query_quality: number | null
  standalone_clarity: number | null
  note: string | null
  scientific_validity: number | null
  top10_relevance: number | null
  near_miss: boolean | null
}

type ReviewDraft = Omit<ReviewRow, 'id' | 'item_id'>

type BucketConfig = {
  key: BucketKey
  title: string
  task_type: TaskType
  subtask: string
}

type ProgressMap = Record<BucketKey, { completed: number; total: number }>

const BUCKETS: BucketConfig[] = [
  { key: 'chemrxiv', title: 'chemrxiv', task_type: 'training', subtask: 'BASF-AI/ChemRxiv-Train-CC-BY' },
  { key: 'dolma', title: 'dolma', task_type: 'training', subtask: 'BASF-AI/dolma-chem-only-query-generated' },
  { key: 'successful', title: 'Successful', task_type: 'evaluation', subtask: 'successful' },
  { key: 'unsuccessful', title: 'Unsuccessful', task_type: 'evaluation', subtask: 'unsuccessful' },
]

const EMPTY_DRAFT: ReviewDraft = {
  answerability: null,
  query_quality: null,
  standalone_clarity: null,
  note: '',
  scientific_validity: null,
  top10_relevance: null,
  near_miss: null,
}

function toSavePayload(draft: ReviewDraft, isTraining: boolean, existing?: ReviewRow) {
  const note = (draft.note ?? '').trim()

  return {
    answerability: draft.answerability ?? existing?.answerability ?? null,
    query_quality: draft.query_quality ?? existing?.query_quality ?? null,
    standalone_clarity: draft.standalone_clarity ?? existing?.standalone_clarity ?? null,
    note: note.length > 0 ? note : null,
    scientific_validity: isTraining
      ? (draft.scientific_validity ?? existing?.scientific_validity ?? null)
      : null,
    top10_relevance: isTraining
      ? null
      : (draft.top10_relevance ?? existing?.top10_relevance ?? null),
    near_miss: isTraining
      ? null
      : (draft.near_miss ?? existing?.near_miss ?? null),
  }
}

function hasAnyFeedback(payload: ReturnType<typeof toSavePayload>) {
  return Object.values(payload).some((value) => value !== null)
}

function isCompleteForTask(draft: ReviewDraft, isTraining: boolean) {
  const commonReady =
    draft.answerability !== null &&
    draft.query_quality !== null &&
    draft.standalone_clarity !== null

  if (!commonReady) return false
  if (isTraining) return draft.scientific_validity !== null
  return draft.top10_relevance !== null && draft.near_miss !== null
}

function draftFromReview(review?: ReviewRow): ReviewDraft {
  if (!review) return EMPTY_DRAFT

  return {
    answerability: review.answerability,
    query_quality: review.query_quality,
    standalone_clarity: review.standalone_clarity,
    note: review.note ?? '',
    scientific_validity: review.scientific_validity,
    top10_relevance: review.top10_relevance,
    near_miss: review.near_miss,
  }
}

function scoreLabel(v: number) {
  return String(v)
}

function sanitizeText(value: unknown) {
  return String(value ?? '').replace(/\n?\[\.\.\. truncated \.\.\.\]/g, '').trimEnd()
}

function normalizeForMatch(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function isLikelyGoldMatch(goldTextRaw: unknown, retrievedTextRaw: unknown) {
  const gold = normalizeForMatch(sanitizeText(goldTextRaw))
  const cand = normalizeForMatch(sanitizeText(retrievedTextRaw))
  if (!gold || !cand) return false

  // Prefer strict equality first.
  if (gold === cand) return true

  // Fallback: prefix/slice matching to handle mild clipping differences.
  const goldPrefix = gold.slice(0, 180)
  const candPrefix = cand.slice(0, 180)
  return goldPrefix.length > 60 && (cand.includes(goldPrefix) || gold.includes(candPrefix))
}

function itemToCsvRow(item: ReviewItem, review: ReviewRow) {
  const payload = item.payload ?? {}
  const retrieved = Array.isArray(payload.retrieved)
    ? payload.retrieved.map((r: RetrievedEntry) => `#${r.rank} ${String(r.doc_id ?? '')}: ${sanitizeText(r.text).replace(/\s+/g, ' ').trim()}`).join(' || ')
    : ''

  return {
    task_type: item.task_type,
    subtask: item.subtask,
    item_id: item.id,
    order_index: item.order_index,
    query: sanitizeText(payload.query ?? payload.query_text),
    passage: sanitizeText(payload.passage),
    gold_passage: sanitizeText(payload.ground_truth_text),
    top10: retrieved,
    answerability: review.answerability,
    query_quality: review.query_quality,
    standalone_clarity: review.standalone_clarity,
    scientific_validity: review.scientific_validity,
    top10_relevance: review.top10_relevance,
    near_miss: review.near_miss,
    note: review.note ?? '',
  }
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => esc(row[h])).join(',')),
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function ReviewPage() {
  const router = useRouter()

  const [authReady, setAuthReady] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [canReview, setCanReview] = useState(false)

  const [selectedBucket, setSelectedBucket] = useState<BucketKey>('chemrxiv')
  const [items, setItems] = useState<ReviewItem[]>([])
  const [reviewsByItem, setReviewsByItem] = useState<Record<string, ReviewRow>>({})
  const [draft, setDraft] = useState<ReviewDraft>(EMPTY_DRAFT)
  const [index, setIndex] = useState(0)
  const [loadingBucket, setLoadingBucket] = useState(false)
  const [progress, setProgress] = useState<ProgressMap>({
    chemrxiv: { completed: 0, total: 0 },
    dolma: { completed: 0, total: 0 },
    successful: { completed: 0, total: 0 },
    unsuccessful: { completed: 0, total: 0 },
  })

  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveTick, setSaveTick] = useState(0)
  const [expandedRetrieved, setExpandedRetrieved] = useState<Record<string, boolean>>({})

  const currentBucket = useMemo(
    () => BUCKETS.find((b) => b.key === selectedBucket)!,
    [selectedBucket]
  )

  const currentItem = items[index] ?? null

  useEffect(() => {
    setExpandedRetrieved({})
  }, [currentItem?.id])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setAuthReady(true)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setAuthReady(true)
    })

    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!authReady) return
    if (!user) {
      router.replace('/login')
      return
    }

    supabase
      .from('profiles')
      .select('can_review')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setCanReview(Boolean(data?.can_review))
      })
  }, [authReady, user, router])

  useEffect(() => {
    if (!user) return

    const fetchProgress = async () => {
      const next: ProgressMap = {
        chemrxiv: { completed: 0, total: 0 },
        dolma: { completed: 0, total: 0 },
        successful: { completed: 0, total: 0 },
        unsuccessful: { completed: 0, total: 0 },
      }

      for (const b of BUCKETS) {
        const { data: bucketItems, count } = await supabase
          .from('review_items')
          .select('id', { count: 'exact' })
          .eq('task_type', b.task_type)
          .eq('subtask', b.subtask)
          .eq('active', true)

        const ids = (bucketItems ?? []).map((r) => r.id as string)
        let completed = 0
        if (ids.length > 0) {
          const { count: reviewCount } = await supabase
            .from('reviews')
            .select('item_id', { count: 'exact', head: true })
            .eq('reviewer_id', user.id)
            .in('item_id', ids)
          completed = reviewCount ?? 0
        }

        next[b.key] = { total: count ?? 0, completed }
      }

      setProgress(next)
    }

    fetchProgress()
  }, [user, saveTick])

  useEffect(() => {
    if (!user) return

    const loadBucket = async () => {
      setLoadingBucket(true)
      setSaveError(null)

      const { data: loadedItems, error: itemsError } = await supabase
        .from('review_items')
        .select('id, task_type, subtask, payload, order_index')
        .eq('task_type', currentBucket.task_type)
        .eq('subtask', currentBucket.subtask)
        .eq('active', true)
        .order('order_index', { ascending: true })

      if (itemsError) {
        setLoadingBucket(false)
        setItems([])
        setReviewsByItem({})
        setIndex(0)
        setDraft(EMPTY_DRAFT)
        return
      }

      const rows = (loadedItems as ReviewItem[]) ?? []
      setItems(rows)
      setIndex(0)

      if (!rows.length) {
        setReviewsByItem({})
        setDraft(EMPTY_DRAFT)
        setLoadingBucket(false)
        return
      }

      const itemIds = rows.map((r) => r.id)
      const { data: loadedReviews } = await supabase
        .from('reviews')
        .select('id, item_id, answerability, query_quality, standalone_clarity, note, scientific_validity, top10_relevance, near_miss')
        .eq('reviewer_id', user.id)
        .in('item_id', itemIds)

      const byItem: Record<string, ReviewRow> = {}
      for (const r of (loadedReviews ?? []) as ReviewRow[]) {
        byItem[r.item_id] = r
      }
      setReviewsByItem(byItem)

      const firstIncompleteIndex = rows.findIndex((item) => {
        const existing = byItem[item.id]
        const d = draftFromReview(existing)
        const isTraining = item.task_type === 'training'
        return !isCompleteForTask(d, isTraining)
      })

      const initialIndex = firstIncompleteIndex >= 0 ? firstIncompleteIndex : 0
      const initialItem = rows[initialIndex]
      setIndex(initialIndex)
      setDraft(draftFromReview(byItem[initialItem.id]))
      setLoadingBucket(false)
    }

    loadBucket()
  }, [user, currentBucket])

  async function persistDraft() {
    if (!user || !canReview || !currentItem) return

    setSaveError(null)
    const isTraining = currentBucket.task_type === 'training'
    let existing: ReviewRow | undefined = reviewsByItem[currentItem.id]

    if (!existing) {
      const { data: existingRow, error: existingError } = await supabase
        .from('reviews')
        .select('id, item_id, answerability, query_quality, standalone_clarity, note, scientific_validity, top10_relevance, near_miss')
        .eq('item_id', currentItem.id)
        .eq('reviewer_id', user.id)
        .maybeSingle()

      if (existingError && existingError.code !== 'PGRST116') {
        setSaveError(existingError.message)
        return
      }

      existing = (existingRow as ReviewRow | null) ?? undefined
    }

    const payload = toSavePayload(draft, isTraining, existing)

    // Keep note optional, but save only when mandatory fields are complete.
    // This prevents partial rows and ensures revisit starts at first incomplete item.
    if (!isCompleteForTask(draft, isTraining)) {
      return
    }

    if (!existing && !hasAnyFeedback(payload)) {
      return
    }

    if (existing) {
      const { data, error } = await supabase
        .from('reviews')
        .update(payload)
        .eq('id', existing.id)
        .select('id, item_id, answerability, query_quality, standalone_clarity, note, scientific_validity, top10_relevance, near_miss')
        .single()

      if (error) {
        setSaveError(error.message)
        return
      }

      setReviewsByItem((prev) => ({ ...prev, [currentItem.id]: data as ReviewRow }))
      setSaveTick((v) => v + 1)
      return
    }

    const { data, error } = await supabase
      .from('reviews')
      .insert({
        item_id: currentItem.id,
        reviewer_id: user.id,
        ...payload,
      })
      .select('id, item_id, answerability, query_quality, standalone_clarity, note, scientific_validity, top10_relevance, near_miss')
      .single()

    if (error) {
      setSaveError(error.message)
      return
    }

    setReviewsByItem((prev) => ({ ...prev, [currentItem.id]: data as ReviewRow }))
    setSaveTick((v) => v + 1)
  }

  useEffect(() => {
    if (!user || !canReview || !currentItem) return

    const timer = setTimeout(() => {
      persistDraft()
    }, 450)

    return () => clearTimeout(timer)
  }, [draft, user, canReview, currentItem, currentBucket.task_type, reviewsByItem])

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  function setDraftField<K extends keyof ReviewDraft>(key: K, value: ReviewDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  function goToIndex(nextIndex: number) {
    const nextItem = items[nextIndex]
    if (!nextItem) return
    setIndex(nextIndex)
    setDraft(draftFromReview(reviewsByItem[nextItem.id]))
  }

  function onScaleChange(field: 'query_quality' | 'standalone_clarity' | 'scientific_validity' | 'top10_relevance') {
    return (e: ChangeEvent<HTMLInputElement>) => {
      setDraftField(field, Number(e.target.value))
    }
  }

  async function onExportCsv() {
    if (!user || !items.length) return
    const rows = items
      .map((item) => {
        const review = reviewsByItem[item.id]
        if (!review) return null
        return itemToCsvRow(item, review)
      })
      .filter(Boolean) as Record<string, unknown>[]

    downloadCsv(`${selectedBucket}-${user.id.slice(0, 8)}.csv`, rows)
  }

  if (!authReady || !user) {
    return (
      <main className="min-h-screen flex items-center justify-center text-sm text-neutral-600">
        Loading session...
      </main>
    )
  }

  const payload = currentItem?.payload ?? {}
  const isTraining = currentBucket.task_type === 'training'

  return (
    <main className="h-screen flex bg-neutral-950 text-neutral-100">
      <aside className="w-80 border-r border-neutral-800 bg-neutral-950 p-4 flex flex-col gap-6">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">ChEmbed Review</h1>
          <p className="text-xs text-neutral-300 break-all">{user.email}</p>
          <button className="cursor-pointer text-xs underline" onClick={signOut}>Logout</button>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-400">Training Data</div>
          <div className="mt-2 space-y-1 text-sm">
            {BUCKETS.filter((b) => b.task_type === 'training').map((b) => (
              <button
                key={b.key}
                onClick={() => setSelectedBucket(b.key)}
                className={`cursor-pointer w-full rounded px-2 py-1 text-left transition-colors ${selectedBucket === b.key ? 'bg-neutral-800 text-white hover:bg-neutral-700' : 'text-neutral-200 hover:bg-neutral-800'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span>{b.title}</span>
                  <span className="text-xs opacity-80">{progress[b.key].completed}/{progress[b.key].total}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-400">Evaluation Data</div>
          <div className="mt-2 space-y-1 text-sm">
            {BUCKETS.filter((b) => b.task_type === 'evaluation').map((b) => (
              <button
                key={b.key}
                onClick={() => setSelectedBucket(b.key)}
                className={`cursor-pointer w-full rounded px-2 py-1 text-left transition-colors ${selectedBucket === b.key ? 'bg-neutral-800 text-white hover:bg-neutral-700' : 'text-neutral-200 hover:bg-neutral-800'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span>{b.title}</span>
                  <span className="text-xs opacity-80">{progress[b.key].completed}/{progress[b.key].total}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={onExportCsv}
          className="cursor-pointer mt-auto rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
          disabled={!items.length}
        >
          Export current bucket CSV
        </button>
      </aside>

      <section className="flex-1 p-6 overflow-auto space-y-4 bg-neutral-950 text-neutral-100">
        {!canReview && (
          <div className="rounded border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Read-only: not authorized to submit reviews
          </div>
        )}

        {saveError && (
          <div className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">Save failed: {saveError}</div>
        )}

        {loadingBucket ? (
          <div className="text-sm text-neutral-600">Loading bucket...</div>
        ) : !currentItem ? (
          <div className="text-sm text-neutral-600">No items available for this bucket.</div>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm">
              <div>{currentBucket.title} • Item {index + 1} / {items.length}</div>
              <div className="flex gap-2">
                <button
                  className="cursor-pointer rounded border border-blue-600 bg-blue-600 px-3 py-1 text-white hover:bg-blue-500 disabled:opacity-50"
                  disabled={!canReview}
                  onClick={persistDraft}
                >
                  Save
                </button>
                <button
                  className="cursor-pointer rounded border border-neutral-700 bg-neutral-900 px-3 py-1 text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
                  disabled={index === 0}
                  onClick={() => goToIndex(Math.max(0, index - 1))}
                >
                  Previous
                </button>
                <button
                  className="cursor-pointer rounded border border-neutral-700 bg-neutral-900 px-3 py-1 text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
                  disabled={index >= items.length - 1}
                  onClick={() => goToIndex(Math.min(items.length - 1, index + 1))}
                >
                  Next
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="rounded border p-4 space-y-4">
                <h2 className="text-xs uppercase tracking-wide text-neutral-400">Presented Data</h2>

                {isTraining ? (
                  <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-2">
                    <div>
                      <div className="text-xs text-neutral-300">Query</div>
                      <p className="mt-1 text-sm whitespace-pre-wrap text-neutral-100">{sanitizeText(payload.query ?? payload.query_text)}</p>
                    </div>
                    <div>
                      <div className="text-xs text-neutral-300">Passage</div>
                      <p className="mt-1 text-sm whitespace-pre-wrap text-neutral-100">{sanitizeText(payload.passage)}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <div className="text-xs text-neutral-300">Query</div>
                      <p className="mt-1 text-sm whitespace-pre-wrap text-neutral-100">{sanitizeText(payload.query ?? payload.query_text)}</p>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-emerald-400">Gold Passage</div>
                      <div className="mt-1 max-h-64 overflow-y-auto rounded border border-neutral-700 bg-neutral-900 p-2">
                        <p className="text-sm whitespace-pre-wrap text-neutral-100">{sanitizeText(payload.ground_truth_text)}</p>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-neutral-300">Top-10 Retrieved</div>
                      <ol className="mt-2 space-y-3 text-sm list-decimal pl-5">
                        {(payload.retrieved ?? []).map((r: RetrievedEntry, i: number) => {
                          const key = `${currentItem.id}-${r.rank ?? i}-${r.doc_id ?? 'doc'}`
                          const fullText = sanitizeText(r.text)
                          const needsToggle = fullText.length > 360
                          const expanded = Boolean(expandedRetrieved[key])
                          const shownText = expanded || !needsToggle ? fullText : fullText.slice(0, 360)
                          const isGold = isLikelyGoldMatch(payload.ground_truth_text, r.text)

                          return (
                            <li key={key}>
                              <p className={`font-medium ${isGold ? 'text-emerald-400' : 'text-neutral-200'}`}>Rank {r.rank} • {r.doc_id}</p>
                              <p className="text-neutral-200 whitespace-pre-wrap">{shownText}</p>
                              {needsToggle && (
                                <button
                                  type="button"
                                  className="cursor-pointer mt-1 text-xs underline text-blue-300"
                                  onClick={() => setExpandedRetrieved((prev) => ({ ...prev, [key]: !expanded }))}
                                >
                                  {expanded ? 'Show less' : 'Read more'}
                                </button>
                              )}
                            </li>
                          )
                        })}
                      </ol>
                    </div>
                  </>
                )}
              </div>

              <div className="rounded border p-4 space-y-5">
                <h2 className="text-xs uppercase tracking-wide text-neutral-400">Expert Feedback Form</h2>

                <fieldset className="space-y-2" disabled={!canReview}>
                  <div>
                    <div className="text-sm font-medium">Answerability</div>
                    <div className="mt-1 flex gap-4 text-sm">
                      <label className="cursor-pointer flex items-center gap-2">
                        <input
                          type="radio"
                          checked={draft.answerability === true}
                          onChange={() => setDraftField('answerability', true)}
                        /> Yes
                      </label>
                      <label className="cursor-pointer flex items-center gap-2">
                        <input
                          type="radio"
                          checked={draft.answerability === false}
                          onChange={() => setDraftField('answerability', false)}
                        /> No
                      </label>
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-medium">Query quality (1-5)</div>
                    <div className="mt-1 flex gap-3 text-sm">
                      {[1, 2, 3, 4, 5].map((v) => (
                        <label key={v} className="cursor-pointer flex items-center gap-1">
                          <input
                            type="radio"
                            value={v}
                            checked={draft.query_quality === v}
                            onChange={onScaleChange('query_quality')}
                          />
                          {scoreLabel(v)}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-medium">Standalone clarity (1-5)</div>
                    <div className="mt-1 flex gap-3 text-sm">
                      {[1, 2, 3, 4, 5].map((v) => (
                        <label key={v} className="cursor-pointer flex items-center gap-1">
                          <input
                            type="radio"
                            value={v}
                            checked={draft.standalone_clarity === v}
                            onChange={onScaleChange('standalone_clarity')}
                          />
                          {scoreLabel(v)}
                        </label>
                      ))}
                    </div>
                  </div>

                  {isTraining ? (
                    <div>
                      <div className="text-sm font-medium">Scientific validity (1-5)</div>
                      <div className="mt-1 flex gap-3 text-sm">
                        {[1, 2, 3, 4, 5].map((v) => (
                          <label key={v} className="cursor-pointer flex items-center gap-1">
                            <input
                              type="radio"
                              value={v}
                              checked={draft.scientific_validity === v}
                              onChange={onScaleChange('scientific_validity')}
                            />
                            {scoreLabel(v)}
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <div className="text-sm font-medium">Top-10 relevance overall (1-5)</div>
                        <div className="mt-1 flex gap-3 text-sm">
                          {[1, 2, 3, 4, 5].map((v) => (
                            <label key={v} className="cursor-pointer flex items-center gap-1">
                              <input
                                type="radio"
                                value={v}
                                checked={draft.top10_relevance === v}
                                onChange={onScaleChange('top10_relevance')}
                              />
                              {scoreLabel(v)}
                            </label>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="text-sm font-medium">Near-miss in top-10?</div>
                        <div className="mt-1 flex gap-4 text-sm">
                          <label className="cursor-pointer flex items-center gap-2">
                            <input
                              type="radio"
                              checked={draft.near_miss === true}
                              onChange={() => setDraftField('near_miss', true)}
                            /> Yes
                          </label>
                          <label className="cursor-pointer flex items-center gap-2">
                            <input
                              type="radio"
                              checked={draft.near_miss === false}
                              onChange={() => setDraftField('near_miss', false)}
                            /> No
                          </label>
                        </div>
                      </div>
                    </>
                  )}

                  <label className="block">
                    <span className="text-sm font-medium">Short note (optional)</span>
                    <textarea
                      className="mt-1 w-full rounded border px-3 py-2 text-sm"
                      rows={4}
                      value={draft.note ?? ''}
                      onChange={(e) => setDraftField('note', e.target.value)}
                      placeholder="One sentence note"
                    />
                  </label>
                </fieldset>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
