// src/app/api/agora-token/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { RtcTokenBuilder, RtcRole } from 'agora-access-token';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = new URL(request.url).searchParams;
  const channelName = searchParams.get('channel');
  const isHost = searchParams.get('isHost') === 'true';

  console.log('Token Generation:', { 
    channelName, 
    isHost, 
    appId: process.env.NEXT_PUBLIC_AGORA_APP_ID?.slice(0,5) + '...', 
    hasCertificate: !!process.env.AGORA_APP_CERTIFICATE 
  });

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
    // In live streaming mode, hosts are publishers and viewers are subscribers
    const role = isHost ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
    
    // Ensure the expiration time is reasonable
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + (24 * 3600); // 24 hours
    
    // Generate a random uid between 1 and 100000
    const uid = Math.floor(Math.random() * 100000);

    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      uid,
      role,
      privilegeExpiredTs
    );

    console.log('Token details:', {
      tokenPrefix: token.substring(0, 32),
      channelName,
      uid,
      role,
      privilegeExpiredTs,
      currentTimestamp
    });
    
    // Ensure token and uid are coupled in response
    return NextResponse.json({ 
      token, 
      uid,  // This UID MUST be used with this token
      appId,
      channelName,
      role: isHost ? 'host' : 'audience',
      timestamp: currentTimestamp,
      expires: privilegeExpiredTs
    });
  } catch (error) {
    console.error('Token generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate token' },
      { status: 500 }
    );
  }
}
