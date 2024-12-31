'use client'

import SolstreamUI from '@/components/ui/SolstreamUI'
import { useStreamStore } from '@/lib/StreamStore'

export default function Home() {
  const streams = useStreamStore(state => state.getAllStreams());

  return (
    <main>
      <SolstreamUI streams={streams} />
    </main>
  )
}
