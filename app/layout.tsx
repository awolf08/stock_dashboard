import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '鬼谷仙 Dashboard',
  description: 'A premium stock dashboard for quotes, events, and reports.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
