// src/app/api/agora-token/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { RtcTokenBuilder, RtcRole } from 'agora-access-token';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = new URL(request.url).searchParams;
  const channelName = searchParams.get('channel');
  const isHost = searchParams.get('isHost') === 'true';

  if (!channelName) {
    return NextResponse.json({ error: 'Channel name is required' }, { status: 400 });
  }

  const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;
  
  if (!appId || !appCertificate) {
    return NextResponse.json(
      { error: 'Agora credentials not configured' },
      { status: 500 }
    );
  }

  try {
    const expirationTimeInSeconds = 24 * 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;
    const uid = Math.floor(Math.random() * 100000);

    const role = isHost ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      uid,
      role,
      privilegeExpiredTs
    );

    return NextResponse.json({ 
      token, 
      uid,
      appId,
      channelName 
    });
  } catch (error) {
    console.error('Token generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate token' },
      { status: 500 }
    );
  }
}
