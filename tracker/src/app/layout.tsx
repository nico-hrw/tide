import type { Metadata } from 'next'
import './globals.css'
import BottomNav from '@/components/BottomNav'
import SyncInit from '@/components/SyncInit'

export const metadata: Metadata = {
  title: 'Tide Tracker',
  description: 'Sport Tracker',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <main className="pb-20 min-h-dvh">{children}</main>
        <BottomNav />
        <SyncInit />
      </body>
    </html>
  )
}
