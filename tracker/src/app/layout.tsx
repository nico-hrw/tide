import type { Metadata } from 'next'
import { Outfit } from 'next/font/google'
import './globals.css'
import BottomNav from '@/components/BottomNav'
import SyncInit from '@/components/SyncInit'

const outfit = Outfit({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Tide Tracker',
  description: 'Sport Tracker',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={outfit.className}>
      <body>
        <main className="min-h-dvh pb-[50px]">{children}</main>
        <BottomNav />
        <SyncInit />
      </body>
    </html>
  )
}
