// src/app/stream/[id]/page.tsx

import { Suspense } from 'react';
import StreamPageClient from './StreamPageClient';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function StreamPage({ params }: PageProps) {
  const { id: streamId } = await params;
  
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p className="text-xl">Loading stream...</p>
      </div>
    }>
      <StreamPageClient streamId={streamId} />
    </Suspense>
  );
}