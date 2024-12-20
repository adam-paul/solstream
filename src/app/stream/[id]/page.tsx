// src/app/stream/[id]/page.tsx
import { Suspense } from 'react';
import StreamPageClient from './StreamPageClient';

type SegmentParams = {
  id: string;
}

export default async function StreamPage({ 
  params 
}: { 
  params: Promise<SegmentParams>
}) {
  const { id } = await params;
  
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p className="text-xl">Loading stream...</p>
      </div>
    }>
      <StreamPageClient streamId={id} />
    </Suspense>
  );
}
