import type { Metadata } from 'next';
import './globals.css';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const metadata: Metadata = {
  title: '鬼谷仙 Dashboard',
  description: 'A premium stock dashboard for quotes, events, and reports.',
  icons: {
    icon: `${basePath}/favicon.svg`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('baybell-theme')||'light';document.documentElement.classList.toggle('dark',t==='dark');document.documentElement.dataset.theme=t;}catch{document.documentElement.dataset.theme='light';}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
