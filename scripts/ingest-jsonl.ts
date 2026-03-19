#!/usr/bin/env node

/**
 * Ingest JSONL review items into Supabase.
 *
 * Usage:
 *   npm run ingest -- --task training
 *   npm run ingest -- --task evaluation
 *
 * Optional:
 *   npm run ingest -- --task training --file /abs/path/to/training_samples.jsonl
 *   npm run ingest -- --task evaluation --file /abs/path/to/evaluation_samples.jsonl
 *
 * Env (local only):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (recommended for ingestion)
 */

import dotenv from 'dotenv'

// Next.js loads `.env.local`, but plain dotenv/config does not by default.
// For local ingestion we explicitly load it.
dotenv.config({ path: '.env.local' })

import fs from 'node:fs'
import readline from 'node:readline'

type TaskType = 'training' | 'evaluation'

type IngestConfig = {
  task: TaskType
  file: string
}

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(name)
  if (idx === -1) return undefined
  return process.argv[idx + 1]
}

function must(v: string | undefined, msg: string): string {
  if (!v) throw new Error(msg)
  return v
}

function stripTruncationMarkers<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replace(/\n?\[\.\.\. truncated \.\.\.\]/g, '').trimEnd() as T
  }

  if (Array.isArray(value)) {
    return value.map((v) => stripTruncationMarkers(v)) as T
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, stripTruncationMarkers(v)])
    return Object.fromEntries(entries) as T
  }

  return value
}

async function ingestOne(cfg: IngestConfig, opts: { endpoint: string; headers: Record<string, string>; batchSize: number }) {
  const { task, file } = cfg
  const { endpoint, headers, batchSize } = opts

  const stream = fs.createReadStream(file, { encoding: 'utf8' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

  let orderIndex = 0
  let inserted = 0
  let batch: any[] = []

  async function flush() {
    if (!batch.length) return
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(batch),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Insert failed: ${res.status} ${text.slice(0, 1500)}`)
    }
    inserted += batch.length
    process.stdout.write(`[${task}] Inserted ${inserted}\n`)
    batch = []
  }

  for await (const lineRaw of rl) {
    const line = lineRaw.trim()
    if (!line) continue

    const obj = stripTruncationMarkers(JSON.parse(line))

    // Skip meta header rows if present
    if (Object.keys(obj).length === 1 && obj.__meta__) continue

    // Derive subtask automatically
    let subtask: string
    if (task === 'training') {
      // Use dataset_id; lets us merge training files into one stream.
      subtask = obj.dataset_id ?? 'unknown_training_dataset'
    } else {
      // Use success boolean
      const s = obj.success
      subtask = s === true ? 'successful' : 'unsuccessful'
    }

    batch.push({
      task_type: task,
      subtask,
      source_file: file.split('/').pop(),
      payload: obj,
      order_index: orderIndex,
      active: true,
    })

    orderIndex += 1

    if (batch.length >= batchSize) {
      await flush()
    }
  }

  await flush()
  process.stdout.write(`[${task}] Done. Total inserted: ${inserted}\n`)
}

async function main() {
  // Default behavior (per your instruction): ingest BOTH files in one run.
  // You can still pass --task to ingest just one.
  const taskArg = arg('--task') as TaskType | undefined
  const batchSize = Number(arg('--batch') ?? '200')

  const url = must(process.env.NEXT_PUBLIC_SUPABASE_URL, 'Missing NEXT_PUBLIC_SUPABASE_URL (did you create .env.local?)')
  const serviceKey = must(process.env.SUPABASE_SERVICE_ROLE_KEY, 'Missing SUPABASE_SERVICE_ROLE_KEY (did you create .env.local?)')

  const endpoint = url.replace(/\/$/, '') + '/rest/v1/review_items'
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  }

  const tasks: IngestConfig[] = []

  if (!taskArg || taskArg === 'training') {
    tasks.push({ task: 'training', file: arg('--file-training') ?? arg('--file') ?? 'data/training_samples.jsonl' })
  }
  if (!taskArg || taskArg === 'evaluation') {
    tasks.push({ task: 'evaluation', file: arg('--file-evaluation') ?? arg('--file') ?? 'data/evaluation_samples.jsonl' })
  }

  for (const cfg of tasks) {
    await ingestOne(cfg, { endpoint, headers, batchSize })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
