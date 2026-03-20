import type { Metadata } from 'next'
import GuideClient from './GuideClient'

export const metadata: Metadata = {
  title: 'Expert Review Guide',
  description: 'Instructions and rubric for expert review of ChEmbed retrieval data',
}

export default function GuidePage() {
  return <GuideClient />
}
