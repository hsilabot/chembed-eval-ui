'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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
    <main className="min-h-screen flex items-center justify-center bg-slate-950 p-6 text-slate-100">
      <div className="w-full max-w-md space-y-5 rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold text-white">ChEmbed Expert Review</h1>
          <p className="mt-1 text-sm text-slate-300">Login with your username.</p>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm text-slate-200">
            <span className="mb-1 block font-medium">Email</span>
            <input
              className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label className="block text-sm text-slate-200">
            <span className="mb-1 block font-medium">Password</span>
            <input
              className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="cursor-pointer w-full rounded bg-slate-100 px-4 py-2 font-medium text-slate-950 disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

      </div>
    </main>
  )
}
