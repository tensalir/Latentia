'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  FolderKanban,
  CheckCircle,
  Bookmark,
  Settings,
} from 'lucide-react'

interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

const navItems: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/',
    icon: LayoutDashboard,
  },
  {
    title: 'Projects',
    href: '/projects',
    icon: FolderKanban,
  },
  {
    title: 'Review',
    href: '/review',
    icon: CheckCircle,
  },
  {
    title: 'Bookmarks',
    href: '/bookmarks',
    icon: Bookmark,
  },
  {
    title: 'Settings',
    href: '/settings',
    icon: Settings,
  },
]

interface DashboardSidebarProps {
  className?: string
}

export function DashboardSidebar({ className }: DashboardSidebarProps) {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/'
    }
    return pathname.startsWith(href)
  }

  return (
    <aside
      className={cn(
        'hidden md:flex w-64 flex-col border-r border-border/50 bg-card/50 backdrop-blur-sm',
        className
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-border/50">
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <img
            src="/images/Loop Vesper (White).svg"
            alt="Loop Vesper"
            className="h-5 dark:block hidden"
          />
          <img
            src="/images/Loop Vesper (Black).svg"
            alt="Loop Vesper"
            className="h-5 dark:hidden block"
          />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              )}
            >
              <item.icon className={cn('h-4 w-4', active ? 'text-primary-foreground' : '')} />
              <span>{item.title}</span>
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border/50">
        <p className="text-xs text-muted-foreground/60 text-center">
          Loop Vesper
        </p>
      </div>
    </aside>
  )
}

