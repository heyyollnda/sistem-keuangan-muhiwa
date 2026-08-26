import { useEffect, type RefObject } from 'react'

/** Calls `handler` when a pointer event lands outside `ref`'s element. Used to close dropdowns/menus. */
export function useClickOutside<T extends HTMLElement>(ref: RefObject<T | null>, handler: () => void, active = true) {
  useEffect(() => {
    if (!active) return

    const listener = (event: MouseEvent) => {
      const el = ref.current
      if (!el || el.contains(event.target as Node)) return
      handler()
    }

    document.addEventListener('mousedown', listener)
    return () => document.removeEventListener('mousedown', listener)
  }, [ref, handler, active])
}
