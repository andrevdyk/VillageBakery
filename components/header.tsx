'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const NAV_LINKS = [
  { href: '/sheets', label: 'Revenue' },
  { href: '/expenses', label: 'Expenses' },
  { href: '/stock', label: 'Stock' },
  { href: '/curios', label: 'Curios' },
]

export function Header() {
  const pathname = usePathname()
  const router = useRouter()

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-50 bg-white shadow-md">
      <div className="flex items-center justify-between px-4 lg:px-8 py-3 max-w-7xl mx-auto">
        <Link href="/" className="flex items-center gap-3 flex-shrink-0">
          <div className="w-20 h-10 rounded-none overflow-hidden">
            <Image
              src="/logo.jpg"
              alt="Village Bakery Logo"
              width={150}
              height={25}
              className="object-cover w-full h-full"
            />
          </div>
        </Link>

        <nav className="flex items-center gap-1">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`text-xs font-medium rounded-full px-4 py-2 transition-colors ${isActive(href)
                ? 'bg-accent text-primary font-semibold'
                : 'text-accent border border-accent/40 hover:bg-accent/10'
                }`}
            >
              {label}
            </Link>
          ))}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs font-medium text-accent border border-accent/40 rounded-full px-4 py-2 hover:bg-accent/10 transition-colors"
          >
            <LogOut size={14} />
            Logout
          </button>
        </nav>
      </div>
    </header>
  )
}