'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      if (data.session?.user) {
        router.replace('/review')
      } else {
        router.replace('/login')
      }
    })

    return () => {
      mounted = false
    }
  }, [router])

  return (
    <main className="min-h-screen flex items-center justify-center text-sm text-neutral-600">
      Redirecting...
    </main>
  )
}
