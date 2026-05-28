import type { Metadata, Viewport } from 'next';
import './globals.css';
import AuthProvider from '@/components/shared/AuthProvider';
import { BRAND_NAME } from '@/lib/brand';

export const metadata: Metadata = {
  title: { default: BRAND_NAME, template: `%s | ${BRAND_NAME}` },
  description: 'Operational Inventory Control — MTC & General Affairs, autentikasi terpisah per modul.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#13131a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
