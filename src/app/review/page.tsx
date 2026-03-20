'use client'

import Link from 'next/link'
import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

type TaskType = 'training' | 'evaluation'
type BucketKey = 'chemrxiv' | 'dolma' | 'successful' | 'unsuccessful'
type ReviewTable = 'training_reviews' | 'evaluation_reviews'

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
  item_id: string
  answerability: boolean | null
  specificity: number | null
  query_quality: number | null
  standalone_clarity: number | null
  note: string | null
  scientific_validity: number | null
  near_miss_ranks: number[] | null
  retrieved_relevance: Record<string, number> | null
}

type ReviewDraft = Omit<ReviewRow, 'item_id'>

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
  specificity: null,
  query_quality: null,
  standalone_clarity: null,
  note: '',
  scientific_validity: null,
  near_miss_ranks: null,
  retrieved_relevance: null,
}

function reviewTableForTask(taskType: TaskType): ReviewTable {
  return taskType === 'training' ? 'training_reviews' : 'evaluation_reviews'
}

function trainingSelect() {
  return 'item_id, answerability, specificity, query_quality, standalone_clarity, scientific_validity, note'
}

function evaluationSelect() {
  return 'item_id, answerability, specificity, query_quality, standalone_clarity, scientific_validity, near_miss_ranks, retrieved_relevance, note'
}

function normalizeRanks(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null
  const ranks = value.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v >= 1)
  return ranks.length ? [...new Set(ranks)].sort((a, b) => a - b) : null
}

function normalizeRetrievedRelevance(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const n = Number(v)
    if ((n === 1 || n === 2 || n === 3) && /^\d+$/.test(k)) out[k] = n
  }
  return Object.keys(out).length ? out : null
}

function toSavePayload(draft: ReviewDraft, isTraining: boolean, existing?: ReviewRow) {
  const note = (draft.note ?? '').trim()
  const nearMissRanks = normalizeRanks(draft.near_miss_ranks ?? existing?.near_miss_ranks ?? null)
  const retrievedRelevance = normalizeRetrievedRelevance(draft.retrieved_relevance ?? existing?.retrieved_relevance ?? null)

  if (isTraining) {
    return {
      answerability: draft.answerability ?? existing?.answerability ?? null,
      specificity: draft.specificity ?? existing?.specificity ?? null,
      query_quality: draft.query_quality ?? existing?.query_quality ?? null,
      standalone_clarity: draft.standalone_clarity ?? existing?.standalone_clarity ?? null,
      note: note.length ? note : null,
      scientific_validity: draft.scientific_validity ?? existing?.scientific_validity ?? null,
    }
  }

  return {
    answerability: draft.answerability ?? existing?.answerability ?? null,
    specificity: draft.specificity ?? existing?.specificity ?? null,
    query_quality: draft.query_quality ?? existing?.query_quality ?? null,
    standalone_clarity: draft.standalone_clarity ?? existing?.standalone_clarity ?? null,
    note: note.length ? note : null,
    scientific_validity: draft.scientific_validity ?? existing?.scientific_validity ?? null,
    near_miss_ranks: nearMissRanks,
    retrieved_relevance: retrievedRelevance,
  }
}

function hasAnyFeedback(payload: ReturnType<typeof toSavePayload>) {
  return Object.values(payload).some((value) => value !== null)
}

function hasAnyDraftInput(draft: ReviewDraft) {
  return (
    draft.answerability !== null ||
    draft.specificity !== null ||
    draft.query_quality !== null ||
    draft.standalone_clarity !== null ||
    draft.scientific_validity !== null ||
    (draft.near_miss_ranks?.length ?? 0) > 0 ||
    Object.keys(draft.retrieved_relevance ?? {}).length > 0 ||
    (draft.note ?? '').trim().length > 0
  )
}

function isCompleteForTask(draft: ReviewDraft, isTraining: boolean, payload?: ItemPayload) {
  const commonReady =
    draft.answerability !== null &&
    draft.specificity !== null &&
    draft.query_quality !== null &&
    draft.standalone_clarity !== null &&
    draft.scientific_validity !== null

  if (!commonReady) return false
  if (isTraining) return true

  const retrieved = Array.isArray(payload?.retrieved) ? payload!.retrieved : []
  const requiredRanks = retrieved
    .slice(0, 10)
    .map((r, i) => ({ rank: Number(r.rank ?? i + 1), isGold: isLikelyGoldMatch(payload?.ground_truth_text, r.text) }))
    .filter((r) => !r.isGold)
    .map((r) => r.rank)

  const relevance = draft.retrieved_relevance ?? {}
  const allRetrievedRated = requiredRanks.every((rank) => {
    const v = relevance[String(rank)]
    return v === 1 || v === 2 || v === 3
  })

  return allRetrievedRated
}

function draftFromReview(review?: ReviewRow): ReviewDraft {
  if (!review) return EMPTY_DRAFT
  return {
    answerability: review.answerability,
    specificity: review.specificity,
    query_quality: review.query_quality,
    standalone_clarity: review.standalone_clarity,
    note: review.note ?? '',
    scientific_validity: review.scientific_validity,
    near_miss_ranks: normalizeRanks(review.near_miss_ranks),
    retrieved_relevance: normalizeRetrievedRelevance(review.retrieved_relevance),
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
  if (gold === cand) return true
  const goldPrefix = gold.slice(0, 180)
  const candPrefix = cand.slice(0, 180)
  return goldPrefix.length > 60 && (cand.includes(goldPrefix) || gold.includes(candPrefix))
}

function itemToCsvRow(item: ReviewItem, review: ReviewRow) {
  const payload = item.payload ?? {}
  const retrieved = Array.isArray(payload.retrieved)
    ? payload.retrieved.map((r: RetrievedEntry, i: number) => ({
        rank: Number(r.rank ?? i + 1),
        doc_id: String(r.doc_id ?? ''),
        text: sanitizeText(r.text).replace(/\s+/g, ' ').trim(),
      }))
    : []

  if (item.task_type === 'training') {
    return {
      task_type: item.task_type,
      subtask: item.subtask,
      item_id: item.id,
      order_index: item.order_index,
      query: sanitizeText(payload.query ?? payload.query_text),
      passage: sanitizeText(payload.passage),
      answerability: review.answerability,
      specificity: review.specificity,
      query_quality: review.query_quality,
      standalone_clarity: review.standalone_clarity,
      scientific_validity: review.scientific_validity,
      note: review.note ?? '',
    }
  }

  return {
    task_type: item.task_type,
    subtask: item.subtask,
    item_id: item.id,
    order_index: item.order_index,
    query: sanitizeText(payload.query ?? payload.query_text),
    gold_passage: sanitizeText(payload.ground_truth_text),
    top10: JSON.stringify(retrieved),
    answerability: review.answerability,
    specificity: review.specificity,
    query_quality: review.query_quality,
    standalone_clarity: review.standalone_clarity,
    scientific_validity: review.scientific_validity,
    near_miss_ranks: review.near_miss_ranks ? JSON.stringify(review.near_miss_ranks) : '',
    retrieved_relevance: review.retrieved_relevance ? JSON.stringify(review.retrieved_relevance) : '',
    note: review.note ?? '',
  }
}

function itemToJsonlRow(item: ReviewItem, review: ReviewRow) {
  return {
    item_id: item.id,
    task_type: item.task_type,
    subtask: item.subtask,
    order_index: item.order_index,
    payload: item.payload ?? {},
    review: {
      answerability: review.answerability,
      specificity: review.specificity,
      query_quality: review.query_quality,
      standalone_clarity: review.standalone_clarity,
      scientific_validity: review.scientific_validity,
      near_miss_ranks: review.near_miss_ranks,
      retrieved_relevance: review.retrieved_relevance,
      note: review.note,
    },
  }
}

function downloadJsonl(filename: string, rows: unknown[]) {
  if (!rows.length) return
  const jsonl = rows.map((r) => JSON.stringify(r)).join('\n') + '\n'
  const blob = new Blob([jsonl], { type: 'application/jsonl;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Kept for convenience (not the primary export format).
function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers.join(','), ...rows.map((row) => headers.map((h) => esc(row[h])).join(','))].join('\n')
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
  const [reviewerIdToView, setReviewerIdToView] = useState<string | null>(null)
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
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  const currentBucket = useMemo(() => BUCKETS.find((b) => b.key === selectedBucket)!, [selectedBucket])
  const currentItem = items[index] ?? null
  const currentTable = reviewTableForTask(currentBucket.task_type)
  const currentSelect = currentBucket.task_type === 'training' ? trainingSelect() : evaluationSelect()

  useEffect(() => {
    setExpandedRetrieved({})
    setSaveStatus('idle')
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

    const resolveRole = async () => {
      const { data: profile } = await supabase.from('profiles').select('can_review').eq('user_id', user.id).maybeSingle()
      const allowed = Boolean(profile?.can_review)
      setCanReview(allowed)

      if (allowed) {
        setReviewerIdToView(user.id)
        return
      }

      // Read-only users should still see the canonical reviewer’s saved labels.
      // Assumption: exactly one reviewer exists.
      const { data: reviewerProfile } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('can_review', true)
        .limit(1)
        .maybeSingle()

      setReviewerIdToView(reviewerProfile?.user_id ?? null)
    }

    resolveRole()
  }, [authReady, user, router])

  useEffect(() => {
    if (!user || !reviewerIdToView) return
    const fetchProgress = async () => {
      const next: ProgressMap = {
        chemrxiv: { completed: 0, total: 0 },
        dolma: { completed: 0, total: 0 },
        successful: { completed: 0, total: 0 },
        unsuccessful: { completed: 0, total: 0 },
      }
      for (const b of BUCKETS) {
        const { data: bucketItems, count } = await supabase.from('review_items').select('id', { count: 'exact' }).eq('task_type', b.task_type).eq('subtask', b.subtask).eq('active', true)
        const ids = (bucketItems ?? []).map((r) => r.id as string)
        let completed = 0
        if (ids.length > 0) {
          const { count: reviewCount } = await supabase
            .from(reviewTableForTask(b.task_type))
            .select('item_id', { count: 'exact', head: true })
            .eq('reviewer_id', reviewerIdToView)
            .in('item_id', ids)
          completed = reviewCount ?? 0
        }
        next[b.key] = { total: count ?? 0, completed }
      }
      setProgress(next)
    }
    fetchProgress()
  }, [user, reviewerIdToView, saveTick])

  useEffect(() => {
    if (!user || !reviewerIdToView) return
    const loadBucket = async () => {
      setLoadingBucket(true)
      setSaveError(null)
      const { data: loadedItems, error: itemsError } = await supabase.from('review_items').select('id, task_type, subtask, payload, order_index').eq('task_type', currentBucket.task_type).eq('subtask', currentBucket.subtask).eq('active', true).order('order_index', { ascending: true })
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
      const { data: loadedReviews } = await supabase.from(currentTable).select(currentSelect).eq('reviewer_id', reviewerIdToView).in('item_id', itemIds)
      const byItem: Record<string, ReviewRow> = {}
      for (const r of ((loadedReviews ?? []) as unknown as ReviewRow[])) byItem[r.item_id] = r
      setReviewsByItem(byItem)
      const firstIncompleteIndex = rows.findIndex((item) => !isCompleteForTask(draftFromReview(byItem[item.id]), item.task_type === 'training', item.payload))
      const initialIndex = firstIncompleteIndex >= 0 ? firstIncompleteIndex : 0
      setIndex(initialIndex)
      setDraft(draftFromReview(byItem[rows[initialIndex].id]))
      setLoadingBucket(false)
    }
    loadBucket()
  }, [user, reviewerIdToView, currentBucket, currentSelect, currentTable])

  async function persistDraft() {
    if (!user || !canReview || !currentItem) return
    setSaveError(null)
    setSaveStatus('saving')
    const isTraining = currentBucket.task_type === 'training'
    let existing: ReviewRow | undefined = reviewsByItem[currentItem.id]
    if (!existing) {
      const { data: existingRow, error: existingError } = await supabase.from(currentTable).select(currentSelect).eq('item_id', currentItem.id).eq('reviewer_id', user.id).maybeSingle()
      if (existingError && existingError.code !== 'PGRST116') {
        setSaveError(existingError.message)
        setSaveStatus('idle')
        return
      }
      existing = (existingRow as ReviewRow | null) ?? undefined
    }
    const payload = toSavePayload(draft, isTraining, existing)
    if (!isCompleteForTask(draft, isTraining, currentItem.payload)) {
      setSaveStatus('idle')
      return
    }
    if (!existing && !hasAnyFeedback(payload)) {
      setSaveStatus('idle')
      return
    }
    if (existing) {
      const { data, error } = await supabase.from(currentTable).update(payload).eq('item_id', currentItem.id).eq('reviewer_id', user.id).select(currentSelect).single()
      if (error) {
        setSaveError(error.message)
        setSaveStatus('idle')
        return
      }
      setReviewsByItem((prev) => ({ ...prev, [currentItem.id]: data as unknown as ReviewRow }))
      setSaveTick((v) => v + 1)
      setSaveStatus('saved')
      return
    }
    const { data, error } = await supabase.from(currentTable).insert({ item_id: currentItem.id, reviewer_id: user.id, ...payload }).select(currentSelect).single()
    if (error) {
      setSaveError(error.message)
      setSaveStatus('idle')
      return
    }
    setReviewsByItem((prev) => ({ ...prev, [currentItem.id]: data as unknown as ReviewRow }))
    setSaveTick((v) => v + 1)
    setSaveStatus('saved')
  }

  useEffect(() => {
    if (!user || !canReview || !currentItem) return
    const isTraining = currentBucket.task_type === 'training'
    if (!hasAnyDraftInput(draft) || !isCompleteForTask(draft, isTraining, currentItem.payload)) {
      setSaveStatus('idle')
      return
    }
    const existing = reviewsByItem[currentItem.id]
    const nowPayload = toSavePayload(draft, isTraining, existing)
    const persistedPayload = existing ? toSavePayload(draftFromReview(existing), isTraining, existing) : null
    const isDirty = existing ? JSON.stringify(nowPayload) !== JSON.stringify(persistedPayload) : hasAnyFeedback(nowPayload)
    if (!isDirty) {
      setSaveStatus('saved')
      return
    }
    setSaveStatus('saving')
    const timer = setTimeout(() => { persistDraft() }, 450)
    return () => clearTimeout(timer)
  }, [draft, user, canReview, currentItem, currentBucket.task_type, reviewsByItem])

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const isReadOnly = !canReview

  function setDraftField<K extends keyof ReviewDraft>(key: K, value: ReviewDraft[K]) {
    if (isReadOnly) return
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  function goToIndex(nextIndex: number) {
    const nextItem = items[nextIndex]
    if (!nextItem) return
    setIndex(nextIndex)
    setDraft(draftFromReview(reviewsByItem[nextItem.id]))
  }

  function onScaleChange(field: 'specificity' | 'query_quality' | 'standalone_clarity' | 'scientific_validity') {
    return (e: ChangeEvent<HTMLInputElement>) => {
      if (isReadOnly) return
      setDraftField(field, Number(e.target.value))
    }
  }

  function toggleNearMissRank(rank: number) {
    if (isReadOnly) return
    setDraft((prev) => {
      const current = prev.near_miss_ranks ?? []
      const next = current.includes(rank) ? current.filter((r) => r !== rank) : [...current, rank].sort((a, b) => a - b)
      return { ...prev, near_miss_ranks: next.length ? next : null }
    })
  }

  function setRetrievedRelevance(rank: number, value: number) {
    if (isReadOnly) return
    setDraft((prev) => ({
      ...prev,
      retrieved_relevance: {
        ...(prev.retrieved_relevance ?? {}),
        [String(rank)]: value,
      },
    }))
  }

  async function exportForTask(taskType: TaskType) {
    if (!user || !reviewerIdToView) return
    const buckets = BUCKETS.filter((b) => b.task_type === taskType)
    const rows: unknown[] = []
    for (const bucket of buckets) {
      const { data: bucketItems } = await supabase
        .from('review_items')
        .select('id, task_type, subtask, payload, order_index')
        .eq('task_type', bucket.task_type)
        .eq('subtask', bucket.subtask)
        .eq('active', true)
        .order('order_index', { ascending: true })

      const itemsForBucket = (bucketItems as ReviewItem[] | null) ?? []
      if (!itemsForBucket.length) continue

      const itemIds = itemsForBucket.map((r) => r.id)
      const { data: bucketReviews } = await supabase
        .from(reviewTableForTask(taskType))
        .select(taskType === 'training' ? trainingSelect() : evaluationSelect())
        .eq('reviewer_id', reviewerIdToView)
        .in('item_id', itemIds)

      const byItem = Object.fromEntries((((bucketReviews ?? []) as unknown as ReviewRow[])).map((r) => [r.item_id, r]))
      for (const item of itemsForBucket) {
        const review = byItem[item.id]
        if (review) rows.push(itemToJsonlRow(item, review))
      }
    }

    if (rows.length) downloadJsonl(`${taskType}-reviews-${reviewerIdToView.slice(0, 8)}.jsonl`, rows)
  }

  async function onExportAllJsonl() {
    await exportForTask('training')
    await exportForTask('evaluation')
  }

  if (!authReady || !user) return <main className="min-h-screen flex items-center justify-center text-sm text-neutral-600">Loading session...</main>

  const payload = currentItem?.payload ?? {}
  const isTraining = currentBucket.task_type === 'training'

  return (
    <main className="h-screen flex bg-neutral-950 text-neutral-100">
      <aside className="w-80 border-r border-neutral-800 bg-neutral-950 p-4 flex flex-col gap-6">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">ChEmbed Review</h1>
          <p className="text-[10px] text-neutral-500">Build: {(process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7)}</p>
          <p className="text-xs text-neutral-300 break-all">{user.email}</p>
          <button className="cursor-pointer text-xs underline" onClick={signOut}>Logout</button>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-400">Training Data (Task A)</div>
          <div className="mt-2 space-y-1 text-sm">
            {BUCKETS.filter((b) => b.task_type === 'training').map((b) => (
              <button key={b.key} onClick={() => setSelectedBucket(b.key)} className={`cursor-pointer w-full rounded px-2 py-1 text-left transition-colors ${selectedBucket === b.key ? 'bg-neutral-800 text-white hover:bg-neutral-700' : 'text-neutral-200 hover:bg-neutral-800'}`}>
                <div className="flex items-center justify-between gap-2"><span>{b.title}</span><span className="text-xs opacity-80">{progress[b.key].completed}/{progress[b.key].total}</span></div>
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-400">Evaluation Data (Task B)</div>
          <div className="mt-2 space-y-1 text-sm">
            {BUCKETS.filter((b) => b.task_type === 'evaluation').map((b) => (
              <button key={b.key} onClick={() => setSelectedBucket(b.key)} className={`cursor-pointer w-full rounded px-2 py-1 text-left transition-colors ${selectedBucket === b.key ? 'bg-neutral-800 text-white hover:bg-neutral-700' : 'text-neutral-200 hover:bg-neutral-800'}`}>
                <div className="flex items-center justify-between gap-2"><span>{b.title}</span><span className="text-xs opacity-80">{progress[b.key].completed}/{progress[b.key].total}</span></div>
              </button>
            ))}
          </div>
        </div>
        <button onClick={onExportAllJsonl} className="cursor-pointer mt-auto rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white transition-colors hover:bg-neutral-800">
          Export Task A + Task B JSONL
        </button>
      </aside>

      <section className="flex-1 p-6 overflow-hidden space-y-4 bg-neutral-950 text-neutral-100">
        {!canReview && <div className="rounded border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">Read-only: not authorized to submit reviews</div>}
        {saveError && <div className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">Save failed: {saveError}</div>}
        {loadingBucket ? (
          <div className="text-sm text-neutral-600">Loading bucket...</div>
        ) : !currentItem ? (
          <div className="text-sm text-neutral-600">No items available for this bucket.</div>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm">
              <div>{currentBucket.title} • Item {index + 1} / {items.length}</div>
              <div className="flex gap-2">
                <Link href="/guide" target="_blank" className="cursor-pointer rounded border border-emerald-700 bg-emerald-700 px-3 py-1 text-white transition-colors hover:bg-emerald-600">Guide</Link>
                <button className="cursor-pointer rounded border border-neutral-700 bg-neutral-900 px-3 py-1 text-white transition-colors hover:bg-neutral-800 disabled:opacity-50" disabled={index === 0} onClick={() => goToIndex(Math.max(0, index - 1))}>Previous</button>
                <button className="cursor-pointer rounded border border-neutral-700 bg-neutral-900 px-3 py-1 text-white transition-colors hover:bg-neutral-800 disabled:opacity-50" disabled={index >= items.length - 1} onClick={() => goToIndex(Math.min(items.length - 1, index + 1))}>Next</button>
              </div>
            </div>

            <div className="grid h-[calc(100vh-9rem)] grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="rounded border p-4 space-y-4 overflow-y-auto min-h-0">
                <h2 className="text-xs uppercase tracking-wide text-neutral-400">Presented Data</h2>
                {isTraining ? (
                  <div className="space-y-4 pr-2">
                    <div><div className="text-xs text-neutral-300">Query</div><p className="mt-1 text-sm whitespace-pre-wrap text-neutral-100">{sanitizeText(payload.query ?? payload.query_text)}</p></div>
                    <div><div className="text-xs text-neutral-300">Passage</div><p className="mt-1 text-sm whitespace-pre-wrap text-neutral-100">{sanitizeText(payload.passage)}</p></div>
                  </div>
                ) : (
                  <>
                    <div><div className="text-xs text-neutral-300">Query</div><p className="mt-1 text-sm whitespace-pre-wrap text-neutral-100">{sanitizeText(payload.query ?? payload.query_text)}</p></div>
                    <div>
                      <div className="text-xs font-medium text-emerald-400">Gold Passage</div>
                      <div className="mt-1 rounded border border-neutral-700 bg-neutral-900 p-2"><p className="text-sm whitespace-pre-wrap text-neutral-100">{sanitizeText(payload.ground_truth_text)}</p></div>
                    </div>
                    <div>
                      <div className="text-xs text-neutral-300">Top-10 Retrieved</div>
                      <ol className="mt-2 space-y-3 text-sm list-decimal pl-5">
                        {(payload.retrieved ?? []).map((r: RetrievedEntry, i: number) => {
                          const key = `${currentItem.id}-${r.rank ?? i}-${r.doc_id ?? 'doc'}`
                          const rank = Number(r.rank ?? i + 1)
                          const fullText = sanitizeText(r.text)
                          const needsToggle = fullText.length > 360
                          const expanded = Boolean(expandedRetrieved[key])
                          const shownText = expanded || !needsToggle ? fullText : fullText.slice(0, 360)
                          const isGold = isLikelyGoldMatch(payload.ground_truth_text, r.text)
                          const relValue = draft.retrieved_relevance?.[String(rank)] ?? null
                          return (
                            <li key={key}>
                              <p className={`font-medium ${isGold ? 'text-emerald-400' : 'text-amber-300'}`}>Rank {rank} • {r.doc_id}</p>
                              <p className="text-neutral-200 whitespace-pre-wrap">{shownText}</p>
                              {needsToggle && <button type="button" className="cursor-pointer mt-1 text-xs underline text-blue-300" onClick={() => setExpandedRetrieved((prev) => ({ ...prev, [key]: !expanded }))}>{expanded ? 'Show less' : 'Read more'}</button>}
                              {!isGold && (
                                <div className={`mt-2 flex flex-wrap gap-3 text-xs ${canReview ? 'text-neutral-300' : 'text-neutral-100'}`}>
                                  {[[1, 'Not relevant'], [2, 'Somewhat relevant'], [3, 'Relevant']].map(([value, label]) => (
                                    <label key={`${rank}-${value}`} className={`flex items-center gap-1 ${canReview ? 'cursor-pointer' : 'cursor-default'}`}>
                                      <input
                                        className={canReview ? 'cursor-pointer' : 'cursor-default'}
                                        type="radio"
                                        name={`retrieved-relevance-${rank}`}
                                        checked={relValue === value}
                                        // Do NOT use `disabled` (it destroys visibility depending on OS/theme).
                                        aria-disabled={!canReview}
                                        tabIndex={canReview ? 0 : -1}
                                        style={canReview ? { accentColor: '#3b82f6' } : { pointerEvents: 'none', accentColor: '#3b82f6' }}
                                        onChange={() => setRetrievedRelevance(rank, Number(value))}
                                      />
                                      <span className={canReview ? 'text-neutral-300' : 'text-neutral-100'}>{label}</span>
                                    </label>
                                  ))}
                                </div>
                              )}
                            </li>
                          )
                        })}
                      </ol>
                    </div>
                  </>
                )}
              </div>

              <div className="rounded border p-4 space-y-5 self-start sticky top-0 h-fit">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs uppercase tracking-wide text-neutral-400">Expert Feedback Form</h2>
                  {saveStatus !== 'idle' && <span className={`rounded px-2 py-0.5 text-xs font-medium ${saveStatus === 'saving' ? 'bg-amber-900/60 text-amber-300 border border-amber-700' : 'bg-emerald-900/60 text-emerald-300 border border-emerald-700'}`}>{saveStatus === 'saving' ? 'Saving' : 'Saved'}</span>}
                </div>
                <fieldset className="space-y-2" disabled={!canReview}>
                  <div>
                    <div className="text-sm font-medium">Answerability</div>
                    <div className="mt-1 flex gap-4 text-sm">
                      <label className="cursor-pointer flex items-center gap-2"><input className="cursor-pointer" type="radio" checked={draft.answerability === true} onChange={() => setDraftField('answerability', true)} /> Yes</label>
                      <label className="cursor-pointer flex items-center gap-2"><input className="cursor-pointer" type="radio" checked={draft.answerability === false} onChange={() => setDraftField('answerability', false)} /> No</label>
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">Specificity (1-5)</div>
                    <div className="mt-1 flex gap-3 text-sm">{[1,2,3,4,5].map((v) => <label key={v} className="cursor-pointer flex items-center gap-1"><input className="cursor-pointer" type="radio" value={v} checked={draft.specificity === v} onChange={onScaleChange('specificity')} />{scoreLabel(v)}</label>)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">Query quality (1-5)</div>
                    <div className="mt-1 flex gap-3 text-sm">{[1,2,3,4,5].map((v) => <label key={v} className="cursor-pointer flex items-center gap-1"><input className="cursor-pointer" type="radio" value={v} checked={draft.query_quality === v} onChange={onScaleChange('query_quality')} />{scoreLabel(v)}</label>)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">Standalone clarity (1-5)</div>
                    <div className="mt-1 flex gap-3 text-sm">{[1,2,3,4,5].map((v) => <label key={v} className="cursor-pointer flex items-center gap-1"><input className="cursor-pointer" type="radio" value={v} checked={draft.standalone_clarity === v} onChange={onScaleChange('standalone_clarity')} />{scoreLabel(v)}</label>)}</div>
                  </div>
                  {isTraining ? (
                    <div>
                      <div className="text-sm font-medium">Scientific validity (1-5)</div>
                      <div className="mt-1 flex gap-3 text-sm">{[1,2,3,4,5].map((v) => <label key={v} className="cursor-pointer flex items-center gap-1"><input className="cursor-pointer" type="radio" value={v} checked={draft.scientific_validity === v} onChange={onScaleChange('scientific_validity')} />{scoreLabel(v)}</label>)}</div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <div className="text-sm font-medium">Scientific validity (1-5)</div>
                        <div className="mt-1 flex gap-3 text-sm">{[1,2,3,4,5].map((v) => <label key={v} className="cursor-pointer flex items-center gap-1"><input className="cursor-pointer" type="radio" value={v} checked={draft.scientific_validity === v} onChange={onScaleChange('scientific_validity')} />{scoreLabel(v)}</label>)}</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium">Near-miss ranks</div>
                        <p className="mt-1 text-xs text-neutral-400">Check any retrieved ranks that are near-misses. Leave all unchecked if none apply.</p>
                        <div className="mt-3 grid grid-cols-5 gap-2 text-sm">
                          {(payload.retrieved ?? []).slice(0, 10).map((r: RetrievedEntry, i: number) => {
                            const rank = Number(r.rank ?? i + 1)
                            const isGold = isLikelyGoldMatch(payload.ground_truth_text, r.text)
                            const checked = draft.near_miss_ranks?.includes(rank) ?? false
                            return (
                              <label key={`near-miss-${rank}`} className={`flex items-center gap-2 rounded border px-2 py-2 ${isGold ? 'cursor-not-allowed border-emerald-800 bg-emerald-950/40 text-emerald-300 opacity-70' : 'cursor-pointer border-neutral-700 bg-neutral-900 text-neutral-100 hover:bg-neutral-800'}`}>
                                <input className="cursor-pointer" type="checkbox" checked={checked} disabled={isGold} onChange={() => toggleNearMissRank(rank)} />
                                <span>Rank {rank}</span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    </>
                  )}
                  <label className="block">
                    <span className="text-sm font-medium">Short note (optional)</span>
                    <textarea className="mt-1 w-full rounded border px-3 py-2 text-sm" rows={4} value={draft.note ?? ''} onChange={(e) => setDraftField('note', e.target.value)} placeholder="One sentence note" />
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
