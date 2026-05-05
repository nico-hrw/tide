'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Dumbbell, History, BarChart2 } from 'lucide-react'

const tabs = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/workout', label: 'Workout', icon: Dumbbell },
  { href: '/history', label: 'Verlauf', icon: History },
  { href: '/stats', label: 'Stats', icon: BarChart2 },
]

export default function BottomNav() {
  const path = usePathname()
  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-100 flex justify-around py-2 z-50">
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = path === href
        return (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-0.5 px-4 py-1"
          >
            <Icon
              size={22}
              className={active ? 'text-black' : 'text-gray-400'}
              strokeWidth={active ? 2.5 : 1.8}
            />
            <span
              className={`text-[10px] font-medium ${active ? 'text-black' : 'text-gray-400'}`}
            >
              {label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
