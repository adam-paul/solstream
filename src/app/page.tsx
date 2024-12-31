'use client'

import SolstreamUI from '@/components/ui/SolstreamUI'
import { useStreamStore } from '@/lib/StreamStore'

export default function Home() {
  const { getAllStreams } = useStreamStore()
  const streams = getAllStreams()

  return (
    <main>
      <SolstreamUI streams={streams} />
    </main>
  )
}
