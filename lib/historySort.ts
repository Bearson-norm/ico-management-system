export type HistorySortDir = 'asc' | 'desc';

export function parseHistorySort(searchParams: URLSearchParams): HistorySortDir {
  return searchParams.get('sort') === 'asc' ? 'asc' : 'desc';
}

/** Urutkan berdasarkan tanggal + waktu (kolom tanggal lalu createdAt). */
export function historyOrderBy(sort: HistorySortDir) {
  return [{ tanggal: sort }, { createdAt: sort }, { id: sort }];
}
