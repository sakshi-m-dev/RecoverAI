import { Link, useLocation } from 'react-router-dom'
import { useBatch } from '../../context/BatchContext'

const NAV_LINKS = [
  { href: '/',      label: 'Dashboard' },
  { href: '/batch', label: 'Batch Run' },
]

export default function Navbar() {
  const { pathname } = useLocation()
  const { phase, progress } = useBatch()
  const batchRunning = phase === 'running'
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <nav className="sticky top-0 z-50 border-b border-white/[0.05] bg-bg-primary/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">

        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-7 h-7 rounded-lg bg-gold/10 border border-gold/25 flex items-center justify-center transition-colors group-hover:bg-gold/20">
            <svg width="13" height="13" viewBox="0 0 32 32" fill="none">
              <path d="M16 4L19.5 12.5H28L21.5 17.5L24 26L16 21L8 26L10.5 17.5L4 12.5H12.5L16 4Z" fill="#F5B731"/>
            </svg>
          </div>
          <span className="font-display text-xl tracking-widest">
            RECOVER<span className="text-gold">AI</span>
          </span>
        </Link>

        {/* Links */}
        <div className="flex items-center gap-1">
          {NAV_LINKS.map(link => {
            const active = pathname === link.href
            const isBatch = link.href === '/batch'
            return (
              <Link
                key={link.href}
                to={link.href}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                  active
                    ? 'bg-gold/10 text-gold border border-gold/20'
                    : 'text-text-secondary hover:text-text-primary hover:bg-white/[0.04]'
                }`}
              >
                {/* Live badge on Batch Run link when a batch is running and we're NOT on /batch */}
                {isBatch && batchRunning && pathname !== '/batch' && (
                  <span className="flex items-center gap-1 text-[9px] font-bold tracking-wider uppercase text-gold bg-gold/15 border border-gold/30 px-1.5 py-0.5 rounded">
                    <span className="w-1 h-1 rounded-full bg-gold pulse-dot" />
                    {pct}%
                  </span>
                )}
                {link.label}
              </Link>
            )
          })}
        </div>

        {/* Right side — live indicator or batch-running chip */}
        <div className="flex items-center gap-2 text-xs text-text-muted select-none">
          {batchRunning ? (
            <Link
              to="/batch"
              className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-gold bg-gold/10 border border-gold/25 px-2.5 py-1 rounded-full hover:bg-gold/20 transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-gold pulse-dot" />
              Batch running · {pct}%
            </Link>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-recovered pulse-dot" />
              Live
            </>
          )}
        </div>

      </div>
    </nav>
  )
}
