import Link from 'next/link'

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">ChEmbed Expert Review</h1>
      <p className="text-sm text-neutral-600">
        Review Training and Evaluation samples from Supabase with autosave and per-bucket progress.
      </p>

      <div className="flex gap-3 text-sm">
        <Link className="rounded border px-3 py-2 hover:bg-neutral-100" href="/login">Login</Link>
        <Link className="rounded border px-3 py-2 hover:bg-neutral-100" href="/review">Open Review App</Link>
      </div>
    </main>
  )
}
