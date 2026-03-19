'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace('/review')
      }
    })
  }, [router])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setLoading(false)

    if (signInError) {
      setError(signInError.message)
      return
    }

    router.replace('/review')
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border bg-white p-6 shadow-sm space-y-5">
        <div>
          <h1 className="text-2xl font-semibold">ChEmbed Expert Review</h1>
          <p className="mt-1 text-sm text-neutral-600">Sign in with your Supabase account.</p>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Email</span>
            <input
              className="w-full rounded border px-3 py-2"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Password</span>
            <input
              className="w-full rounded border px-3 py-2"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {error && <p className="text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-xs text-neutral-600">
          Need the reviewer app? <Link className="underline" href="/review">Go to review</Link>
        </p>
      </div>
    </main>
  )
}
