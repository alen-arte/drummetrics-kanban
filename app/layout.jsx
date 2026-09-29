import { Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata = { title: 'DrumMetrics · Tasks' }

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="min-h-screen bg-[var(--bg-page)] font-sans text-slate-900 antialiased">{children}</body>
    </html>
  )
}