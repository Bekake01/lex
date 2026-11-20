import type { Metadata } from 'next';
import { Figtree, Geist_Mono, Outfit, Source_Serif_4 } from 'next/font/google';
import { ThemeScript } from '@lex/theme';
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
  title: 'Lex — AI yuridik yordamçi',
  description: 'Şartnomalarni AI bilan tekşiring va imzolang, yuridik savollarga javob oling',
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
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
