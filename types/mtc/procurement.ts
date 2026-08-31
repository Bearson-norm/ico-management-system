export type Sparepart = {
  id: string;
  nama: string;
  uom: string;
  lokasi: string | null;
  harga: number;
  minQty: number;
  namaAlias?: string | null;
  linkReference?: string | null;
  alasan?: string | null;
  purchasingStatus?: string | null;
  odooNotes?: string | null;
  vendor?: string | null;
};

export type TrackingItem = {
  id: number;
  fbIndex: number | null;
  originalName: string;
  sparepartId: string | null;
  keterangan: string | null;
  penggunaanBulan: number | null;
  kontrak3Bulan: boolean;
  tanggalList: string;
  qty: number;
  productCategory: string | null;
  reason: string | null;
  urgency: string;
  linkReferences: string | null;
  vendor: string | null;
  harga: number | null;
  nomorPr: string | null;
  statusPr: string;
  statusPa: string | null;
  statusPo: string | null;
  nomorPo: string | null;
  nomorTe?: string | null;
  poApproved: boolean;
  etaFoom: string | null;
  linkGr: string | null;
  tanggalTerima: string | null;
  isStocked: boolean;
  sparepart?: Sparepart | null;
  linkedPartsJson?: string | null;
  sheetId?: string | null;
  odooNotes?: string | null;
  isPengadaanBaru?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type GroupedPrItem = {
  nomorPr: string | null;
  nomorPo: string | null;
  items: TrackingItem[];
  totalQty: number;
  totalCost: number;
  vendors: string;
  poNumbers: string;
  prNumbers: string;
  hasUrgent: boolean;
  overallStatus: 'DRAFT' | 'APPROVAL' | 'PO' | 'DONE' | 'CANCELLED';
  daysRunningStr: string;
  oldestDate: Date | null;
  oldestDateStr: string;
  poItemsCount: number;
  belumGrCount: number;
};

export type TabType =
  | 'ALL'
  | 'DRAFT'
  | 'APPROVAL'
  | 'PO'
  | 'DONE';

export type CardFilterType =
  | 'DRAFT'
  | 'APPROVAL'
  | 'PO'
  | 'DONE'
  | null;

