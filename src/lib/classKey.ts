import type { Grade, ProgramKeahlian } from '../types'

/** Composite key identifying one Kelas + Program Keahlian + Tahun Ajaran combination in
 *  FeeConfig — fees go up every year, so the same Kelas+Program can have several tahun ajaran
 *  "generations" of categories at once, each independently priced. */
export function classKey(grade: Grade, programKeahlian: ProgramKeahlian, tahunAjaran: string): string {
  return `${grade}__${programKeahlian}__${tahunAjaran}`
}

/** Inverse of classKey — splits a FeeConfig key back into its Grade, Program Keahlian, and
 *  Tahun Ajaran. */
export function parseClassKey(key: string): { grade: Grade; programKeahlian: ProgramKeahlian; tahunAjaran: string } {
  const [grade, programKeahlian, tahunAjaran] = key.split('__') as [Grade, ProgramKeahlian, string]
  return { grade, programKeahlian, tahunAjaran }
}
