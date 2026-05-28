import type { Viewport } from 'next';
import './ga-theme.css';

export const viewport: Viewport = {
  themeColor: '#f4f6fa',
};

export default function GaSegmentLayout({ children }: { children: React.ReactNode }) {
  return <div className="ga-root">{children}</div>;
}
