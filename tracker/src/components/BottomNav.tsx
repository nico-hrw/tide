'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, History, BarChart2 } from 'lucide-react'

const tabs = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/history', label: 'Verlauf', icon: History },
  { href: '/stats', label: 'Stats', icon: BarChart2 },
]

export default function BottomNav() {
  const path = usePathname()
  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] h-[50px] flex justify-around items-center pb-1 z-50"
      style={{ background: '#18181F', borderTop: '1px solid #2E2E38' }}
    >
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = path === href
        return (
          <Link key={href} href={href} className="flex flex-col items-center gap-0.5 px-4 py-1">
            <Icon
              size={20}
              color={active ? '#FF6B3D' : '#4B5563'}
              strokeWidth={active ? 2.5 : 1.8}
            />
            <span
              className="text-[7px] font-semibold"
              style={{ color: active ? '#FF6B3D' : '#4B5563' }}
            >
              {label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
