export default function MtcViewerLayout({ children }: { children: React.ReactNode }) {
  // Viewer stok publik (tanpa login), seperti V2 /stock
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '20px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {children}
      </div>
    </div>
  );
}
