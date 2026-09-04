import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  /** The table markup itself (or anything else that can overflow horizontally). */
  children: ReactNode
  /** Passed through to the scrolling container, so callers can keep their own border/rounding
   *  exactly as before (e.g. `rounded-lg border border-slate-200`) — this component only adds
   *  the arrow row above it, not new visual chrome around the table. */
  className?: string
}

const SCROLL_STEP_PX = 240

/**
 * Wraps a horizontally-scrollable table with left/right arrow buttons pinned right above the
 * table content — so a staff member doesn't have to scroll all the way down a tall table
 * first just to reach the browser's native horizontal scrollbar sitting at its bottom edge.
 * Native scrolling (wheel+Shift, trackpad, dragging the browser's own scrollbar) still works
 * exactly as before; this only adds an easier alternative on top of it.
 *
 * The arrow row only renders at all once the content actually overflows — a table that
 * already fits stays exactly as plain as it was.
 */
export default function ScrollableTable({ children, className = '' }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [hasOverflow, setHasOverflow] = useState(false)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    // 1px tolerance for subpixel layout rounding, so the "at the end" state doesn't flicker
    // between enabled/disabled at the exact edge.
    const update = () => {
      setHasOverflow(el.scrollWidth > el.clientWidth + 1)
      setCanScrollLeft(el.scrollLeft > 1)
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
    }

    update()
    el.addEventListener('scroll', update, { passive: true })

    // Catches the table's own content changing width (rows loading in, a column appearing)
    // even when the scroll container's own box size doesn't change — plain resize listeners
    // on the container wouldn't see that.
    const resizeObserver = new ResizeObserver(update)
    resizeObserver.observe(el)
    if (el.firstElementChild) resizeObserver.observe(el.firstElementChild)

    return () => {
      el.removeEventListener('scroll', update)
      resizeObserver.disconnect()
    }
  }, [])

  const scrollBy = (direction: 1 | -1) => {
    scrollRef.current?.scrollBy({ left: direction * SCROLL_STEP_PX, behavior: 'smooth' })
  }

  return (
    <div>
      {hasOverflow && (
        <div className="no-print flex items-center justify-end gap-1.5 px-5 pt-3 pb-1">
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            disabled={!canScrollLeft}
            aria-label="Geser tabel ke kiri"
            title="Geser ke kiri"
            className="h-7 w-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            disabled={!canScrollRight}
            aria-label="Geser tabel ke kanan"
            title="Geser ke kanan"
            className="h-7 w-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
      <div ref={scrollRef} className={className}>
        {children}
      </div>
    </div>
  )
}
