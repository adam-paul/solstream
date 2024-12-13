import type { Metadata } from 'next'
import '@/app/globals.css'  

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
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  )
}