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
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={inter.className}>
      <body className="font-sans">
        <ClientWalletProvider>
          {children}
        </ClientWalletProvider>
      </body>
    </html>
  )
}