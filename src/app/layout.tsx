import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import '@/app/globals.css'
import { ClientWalletProvider } from '@/lib/ClientWalletProvider'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Solstream - Token-Gated Livestreaming',
  description: 'Token-gated livestreaming platform on Solana',
  manifest: '/manifest.json',
  themeColor: '#121B1C',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Solstream',
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={inter.className}>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className="font-sans">
        <ClientWalletProvider>
          {children}
        </ClientWalletProvider>
      </body>
    </html>
  )
}