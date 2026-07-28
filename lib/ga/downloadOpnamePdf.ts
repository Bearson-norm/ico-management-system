/** Trigger browser download of GA opname worksheet PDF. Returns false if fetch failed. */
export async function downloadOpnamePdf(sessionId: number): Promise<boolean> {
  try {
    const res = await fetch(`/api/ga/opname/${sessionId}/export`);
    if (!res.ok) return false;

    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match?.[1] || `opname-ga-${sessionId}.pdf`;

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}
