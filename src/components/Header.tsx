import type { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  /** "large" is used for page-level greetings (e.g. the Dashboard) that should read as the dominant heading. */
  size?: 'default' | 'large'
  /** Optional content anchored to the right end of the subtitle row (e.g. a small credit line). */
  subtitleExtra?: ReactNode
}

export default function Header({ title, subtitle, size = 'default', subtitleExtra }: Props) {
  const isLarge = size === 'large'

  return (
    <div className="mb-6 pt-12 lg:pt-0">
      <h1
        className={
          isLarge
            ? 'text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight'
            : 'text-2xl font-bold text-slate-900 tracking-tight'
        }
      >
        {title}
      </h1>
      {subtitle && (
        <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 ${isLarge ? 'mt-2' : 'mt-1'}`}>
          <p className={isLarge ? 'text-base sm:text-lg font-medium text-slate-500' : 'text-slate-500 text-sm'}>
            {subtitle}
          </p>
          {subtitleExtra}
        </div>
      )}
    </div>
  )
}
