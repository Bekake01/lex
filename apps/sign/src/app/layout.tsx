import type { Metadata } from 'next';
import { Figtree, Geist_Mono, Outfit, Source_Serif_4 } from 'next/font/google';
import { LogoMark } from '@/components/Icons';
import { ThemeScript, ThemeToggle } from '@lex/theme';
import './globals.css';

const figtree = Figtree({
  variable: '--font-figtree',
  subsets: ['latin'],
});

const outfit = Outfit({
  variable: '--font-outfit',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const sourceSerif = Source_Serif_4({
  variable: '--font-source-serif',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Lex — Imzolaş',
  description: 'Sizga yuborilgan şartnomani körib çiqing va imzolang',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="uz"
      className={`${figtree.variable} ${outfit.variable} ${geistMono.variable} ${sourceSerif.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="flex min-h-full flex-col font-sans">
        <div className="px-3 pt-3 sm:px-6 sm:pt-4">
          <header className="frost mx-auto flex h-16 max-w-3xl items-center rounded-2xl px-6">
            <span className="flex items-center gap-2.5">
              <LogoMark className="size-9" />
              <span className="font-display text-2xl font-semibold tracking-tight text-ink">lex</span>
            </span>
            <span className="ml-auto text-sm text-muted">Xavfsiz elektron imzo</span>
            <ThemeToggle className="ml-3" />
          </header>
        </div>
        <main className="flex flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}
