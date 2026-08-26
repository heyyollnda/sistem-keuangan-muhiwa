import type { Grade, ProgramKeahlian } from '../types'

/** Composite key identifying one Kelas + Program Keahlian combination in FeeConfig. */
export function classKey(grade: Grade, programKeahlian: ProgramKeahlian): string {
  return `${grade}__${programKeahlian}`
}

/** Inverse of classKey — splits a FeeConfig key back into its Grade and Program Keahlian. */
export function parseClassKey(key: string): { grade: Grade; programKeahlian: ProgramKeahlian } {
  const [grade, programKeahlian] = key.split('__') as [Grade, ProgramKeahlian]
  return { grade, programKeahlian }
}
