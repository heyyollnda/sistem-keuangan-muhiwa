interface Props {
  size?: number
  className?: string
}

/** Official crest for SMK Muhammadiyah 1 Wates (MUHIWA). */
export default function SchoolLogo({ size = 32, className = '' }: Props) {
  return (
    <img
      src="/logo-muhiwa.png"
      alt="Logo SMK Muhammadiyah 1 Wates"
      width={size}
      height={size}
      className={className}
      style={{ objectFit: 'contain' }}
    />
  )
}
