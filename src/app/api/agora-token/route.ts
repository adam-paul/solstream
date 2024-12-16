// src/app/api/agora-token/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { RtcTokenBuilder, RtcRole } from 'agora-access-token';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = new URL(request.url).searchParams;
  const channelName = searchParams.get('channel');
  
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
    // Set token expiry for 24 hours
    const expirationTimeInSeconds = 24 * 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;
    
    // Generate a random uid between 1 and 100000
    const uid = Math.floor(Math.random() * 100000);

    // Build the token with SUBSCRIBER role for viewers
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      uid,
      RtcRole.SUBSCRIBER,
      privilegeExpiredTs
    );

    return NextResponse.json({ 
      token, 
      uid,
      appId, // Send appId to client for initialization
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
