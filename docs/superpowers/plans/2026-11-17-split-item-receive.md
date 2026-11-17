# Split Item Multi-Item Goods Receipt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Memungkinkan pemecahan 1 baris item PO menjadi 2+ `StockMovement` ke `Sparepart` master berbeda dalam 1 transaksi atomik langsung di modal **Terima Barang**, dengan input pembagian harga yang lega dan tampilan bersih sesuai `antislop-ui`.

**Architecture:** Menambahkan utilitas bersama `lib/mtc/bundle-receive.ts` untuk parsing/validasi paket dan kalkulasi alokasi harga PO, memperbarui endpoint `receive`, `procurement`, dan `odoo/sync` untuk transaksi multi-item yang aman, lalu memperluas `ReceiveModal` dengan mode ke-3 (`Pecah Item (Multi-Item)`) yang melebar otomatis (`820px`) menggunakan komponen `SplitReceiveSection` serta menampilkan rincian item pecahan di `ProcurementGroupList`.

**Tech Stack:** Next.js 14 (App Router), React 18, TypeScript 5, Prisma 5 (PostgreSQL), Node 24 built-in test runner (`node:test`).

**Spec:** [docs/superpowers/specs/2026-11-17-split-item-receive-design.md](../specs/2026-11-17-split-item-receive-design.md)

## Global Constraints

- Tanpa membuat master sparepart gabungan ("1 Set") dan tanpa memecah baris `ProcurementTracking` sebelum PO selesai.
- Kedatangan dan tujuan akhir seluruh komponen pecahan dalam 1 transaksi selalu sama (`Masuk Stok Gudang` atau `Langsung Pakai`).
- Tidak membuka modal bertumpuk di atas modal; cukup 1 modal `ReceiveModal` yang melebar saat mode `Pecah Item (Multi-Item)` dipilih, dengan panel `+ Buat Master Baru` inline.
- `antislop-ui` Design Read: modal dark operational tool (`#13131a` / `#1a1a24`, `Inter`, aksen fungsional hijau untuk konfirmasi dan ungu/biru untuk fokus/state aktif), dial `ENERGY 1 / RHYTHM 1 / MOTION 1`.
- `R-02`: Dilarang menggunakan karakter em dash (`—`) pada teks UI baru/yang diubah.
- `R-04`: Hapus emoji dekoratif pada modal penerimaan; gunakan teks bersih dan ikon SVG fungsional 16px minimal dengan `aria-hidden="true"`.
- `R-25` & `R-29`: Kontras teks normal >= 4.5:1 (pakai `--tx`/`--tx2` `#a0a0c0`, hindari `--tx3` `#606080` untuk teks informasi/label; tombol hijau konfirmasi >= 4.5:1 dengan `#15803d` dan teks `#ffffff`).
- `R-32` & `R-39`: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, tutup via `Escape`, `:focus-visible` jelas, semua kontrol pakai `<button>` dan `<label htmlFor>` native.
- `R-03`: Responsif tanpa horizontal overflow di mobile (< 640px) dengan target sentuh tombol >= 44px.

## Review Focus

- Duplikasi `sparepartId` dalam `receivedParts` (misalnya memilih `Relay MY4N` di baris 1 dan baris 2) harus ditolak di UI dan API agar `StockMovement` tidak saling menimpa.
- Penyimpanan ulang atau perubahan daftar komponen saat edit penerimaan harus menghapus `StockMovement` `[Penerimaan Paket #<id>` lama yang tidak lagi dipilih dan mereset status `Sparepart`-nya.
- Mengklik `Masuk Stok Gudang` pada item PO yang `sparepartId`-nya masih `null` harus tetap diizinkan saat mode `Pecah Item` aktif dan komponen pecahan memiliki `sparepartId`.
- Sinkronisasi Odoo (`odoo/sync`) pada item berstatus `bundle` yang sudah memiliki `tanggalTerima` tidak boleh memicu auto-split parsial walaupun `qty` komponen berbeda dari `qty` baris PO Odoo.
- `Batal Terima` (`DELETE`) dan toggle `isStocked` (`PATCH`) harus memproses semua `sparepartId` dan `StockMovement` milik paket, bukan hanya `findFirst` atau `tracking.sparepartId` tunggal.

---

### Task 1: Pure Bundle Metadata, Validation & Price Allocation Utilities

**Files:**
- Create: `lib/mtc/bundle-receive.ts` (self-contained pure TS module with zero runtime imports so Node 24 native test runner and Next.js both load it cleanly)
- Modify: `types/mtc/procurement.ts:40-50`
- Test: `tests/mtc/bundle-receive.test.mjs` (uses `node:test`, `node:assert/strict`, and `createRequire(import.meta.url)('../../lib/mtc/bundle-receive.ts')`)

**Interfaces:**
- Produces in `lib/mtc/bundle-receive.ts`:
  - `export type BundlePartInput = { sparepartId: string; nama: string; qty: number; harga: number; uom?: string; lokasi?: string | null }`
  - `export type BundleMetadata = { type: 'bundle'; parts: BundlePartInput[] }`
  - `export type ReceiveMode = 'unit' | 'pack' | 'split'`
  - `export function parseBundleParts(linkedPartsJson: string | null | undefined): BundlePartInput[] | null`
  - `export function serializeBundleParts(parts: BundlePartInput[]): string`
  - `export function extractBundleSparepartIds(linkedPartsJson: string | null | undefined): string[]`
  - `export function validateBundleParts(parts: unknown): { valid: true; parts: BundlePartInput[] } | { valid: false; error: string }`
  - `export function calculateBundleAllocation(poQty: number, poUnitPrice: number, parts: Array<{ qty: number; harga: number }>): { poTotal: number; allocatedTotal: number; difference: number }`
  - `export function allocateEvenlyByQty(poTotal: number, parts: Array<{ qty: number }>): number[]`
  - `export function allocateRemainingToLast(poTotal: number, parts: Array<{ qty: number; harga: number }>): number`
  - `export function shouldSkipPartialAutoSplitForBundle(linkedPartsJson: string | null | undefined, isItemPhysicallyReceived: boolean): boolean`

- [x] **Step 1: Write the failing unit tests in `tests/mtc/bundle-receive.test.mjs`**

Write tests covering:
- `parseBundleParts` parses `{ type: 'bundle', parts: [...] }`, legacy array `[{ id, nama, qty, harga }]`, and returns `null` for pack metadata (`{ type: 'pack', ... }`), invalid JSON, or `null`.
- `validateBundleParts` rejects fewer than 2 items, empty `sparepartId`, duplicate `sparepartId` (Review Focus #1), `qty <= 0`, or negative `harga`; accepts 2+ distinct valid items.
- `calculateBundleAllocation(10, 67488, [{ qty: 10, harga: 50000 }, { qty: 10, harga: 17488 }])` equals `{ poTotal: 674880, allocatedTotal: 674880, difference: 0 }`.
- `allocateEvenlyByQty(674880, [{ qty: 10 }, { qty: 10 }])` returns `[33744, 33744]`; handles `poTotal = 0` or `qty <= 0` safely without `NaN` or negative numbers.
- `allocateRemainingToLast(674880, [{ qty: 10, harga: 50000 }, { qty: 10, harga: 0 }])` returns `17488`, and clamps to `0` if previous rows exceed `poTotal`.
- `shouldSkipPartialAutoSplitForBundle` returns `true` when `linkedPartsJson` is a valid bundle and `isItemPhysicallyReceived` is `true`, and `false` for pack/empty metadata (Review Focus #4).

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/mtc/bundle-receive.test.mjs`
Expected: FAIL with module not found error for `lib/mtc/bundle-receive.ts`.

- [x] **Step 3: Implement `lib/mtc/bundle-receive.ts` and re-export `ReceiveMode` in `types/mtc/procurement.ts`**

Implement the exact signatures above in `lib/mtc/bundle-receive.ts` with JSDoc comments, and re-export `ReceiveMode` and `BundlePartInput` in `types/mtc/procurement.ts`. In `parseBundleParts`, normalize both `part.sparepartId` and legacy `part.id`, and sanitize `qty` / `harga`. In `allocateEvenlyByQty`, divide `poTotal / parts.length` per slot then divide by `Math.max(1, Math.round(part.qty))` and round cleanly.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/mtc/bundle-receive.test.mjs`
Expected: PASS (all assertions green).

- [x] **Step 5: Commit Task 1**

```bash
git add lib/mtc/bundle-receive.ts types/mtc/procurement.ts tests/mtc/bundle-receive.test.mjs
git commit -m "feat(mtc): add bundle receive parsing, validation, and price allocation helpers"
```

---

### Task 2: Backend Multi-Item Receive Transaction, Unreceive, Patch & Odoo Sync Guard

**Files:**
- Modify: `app/api/mtc/procurement/receive/route.ts:100-191` and `552-655`
- Modify: `app/api/mtc/procurement/route.ts:285-325`
- Modify: `app/api/mtc/odoo/sync/route.ts:1-15` and `2339-2381`
- Test: `tests/mtc/bundle-receive.test.mjs`

**Interfaces:**
- Consumes from Task 1 (`lib/mtc/bundle-receive.ts`):
  - `validateBundleParts`, `serializeBundleParts`, `extractBundleSparepartIds`, `shouldSkipPartialAutoSplitForBundle`
- Produces in `lib/mtc/bundle-receive.ts`:
  - `export function getStaleBundleSparepartIds(existingSparepartIds: Array<string | null>, incomingParts: BundlePartInput[]): string[]`
  - `export function collectAffectedBundleSparepartIds(primarySparepartId: string | null | undefined, linkedPartsJson: string | null | undefined): string[]`

- [x] **Step 1: Write failing tests for stale cleanup & affected sparepart collection in `tests/mtc/bundle-receive.test.mjs`**

Write tests verifying:
- `getStaleBundleSparepartIds(['SP-1', 'SP-2', 'SP-3'], [{ sparepartId: 'SP-1', ... }, { sparepartId: 'SP-4', ... }])` returns `['SP-2', 'SP-3']` (Review Focus #2).
- `collectAffectedBundleSparepartIds('SP-1', serializeBundleParts([{ sparepartId: 'SP-1', ... }, { sparepartId: 'SP-2', ... }]))` returns unique `['SP-1', 'SP-2']` (Review Focus #5).
- `collectAffectedBundleSparepartIds(null, '[{"id":"SP-2","nama":"Base","qty":10,"harga":17488}]')` returns `['SP-2']`.

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/mtc/bundle-receive.test.mjs`
Expected: FAIL because helper functions are not exported yet.

- [x] **Step 3: Implement helpers in `lib/mtc/bundle-receive.ts` and update `receive/route.ts`, `procurement/route.ts`, and `odoo/sync/route.ts`**

1. Export `getStaleBundleSparepartIds` and `collectAffectedBundleSparepartIds` in `lib/mtc/bundle-receive.ts`.
2. In `app/api/mtc/procurement/receive/route.ts` (`POST` Section A, lines 100-191):
   - Validate `receivedParts` using `validateBundleParts(receivedParts)`; if invalid, return `err(validation.error, 400)`.
   - Inside `prisma.$transaction`:
     - Find existing movements with prefix `[Penerimaan Paket #${tracking.id}`, compute stale `sparepartId`s via `getStaleBundleSparepartIds`, delete stale `StockMovement` rows, and recalculate `purchasingStatus` for stale parts if needed.
     - For each validated part: verify `Sparepart` exists, `update` existing or `create` `StockMovement` (`tipe: isStocked ? 'IN' : 'LOG'`, `lokasi: isStocked ? sp.lokasi : null`, `qty: part.qty`, `harga: part.harga`, `vendor: finalVendor`, `tanggal: tDate`), and update `Sparepart` (`harga: part.harga`, `purchasingStatus: 'NONE'`, `purchasingQty: 0`, `prDate: null`, `poDate: null`, `avgLeadTime`, `maxLeadTime`).
     - Update `procurementTracking` with `tanggalTerima: tDate`, `isStocked: Boolean(isStocked)`, `harga: finalHarga`, `vendor: finalVendor`, and `linkedPartsJson: serializeBundleParts(validatedParts)`.
3. In `app/api/mtc/procurement/receive/route.ts` (`DELETE`, lines 630-655):
   - Loop over `collectAffectedBundleSparepartIds(tracking.sparepartId, tracking.linkedPartsJson)` to recalculate `purchasingStatus`, `purchasingNoPr`, `purchasingNoPo`, and `purchasingQty` for every sparepart in the bundle (Review Focus #5).
4. In `app/api/mtc/procurement/route.ts` (`PATCH`, lines 288-324):
   - Fetch all matching `StockMovement` rows (`findMany`) for `[Penerimaan Paket #${updated.id}` / `[Penerimaan Pengadaan #${updated.id}` (instead of single `findFirst`) and update `tipe` (`IN` or `LOG`) and `lokasi` (looking up each movement's `Sparepart.lokasi` when `IN`) for all rows (Review Focus #5).
5. In `app/api/mtc/odoo/sync/route.ts` (around line 2342):
   - Use `shouldSkipPartialAutoSplitForBundle(item.linkedPartsJson, isItemPhysicallyReceived)` so received bundle items never trigger phantom partial PO splits (Review Focus #4).

- [x] **Step 4: Run tests, ensure worktree dependencies are ready, and run typecheck**

If `node_modules` or `lib/generated` is not present in the worktree, run `npm ci && npm run prisma:generate`.
Then run: `node --test tests/mtc/bundle-receive.test.mjs && npm run typecheck`
Expected: All tests PASS and `tsc --noEmit` exits 0 with no errors.

- [x] **Step 5: Commit Task 2**

```bash
git add lib/mtc/bundle-receive.ts app/api/mtc/procurement/receive/route.ts app/api/mtc/procurement/route.ts app/api/mtc/odoo/sync/route.ts tests/mtc/bundle-receive.test.mjs
git commit -m "fix(mtc): harden multi-item receive, unreceive, patch, and odoo sync guard"
```

---

### Task 3: `SplitReceiveSection` Component, Accessible `ReceiveModal` Redesign & CSS Polish (`antislop-ui`)

**Files:**
- Create: `components/mtc/po-pr/Modals/SplitReceiveSection.tsx`
- Modify: `components/mtc/po-pr/Modals/ReceiveModal.tsx:1-443`
- Modify: `app/globals.css` (add modal/split responsive & focus classes near `.modal-backdrop` / end of file)

**Interfaces:**
- Consumes from Task 1 (`lib/mtc/bundle-receive.ts`):
  - `BundlePartInput`, `ReceiveMode`, `calculateBundleAllocation`, `allocateEvenlyByQty`, `allocateRemainingToLast`
- Produces in `components/mtc/po-pr/Modals/SplitReceiveSection.tsx`:
  - `export const SplitReceiveSection: React.FC<{ poQty: number; poUnitPrice: number; parts: BundlePartInput[]; setParts: React.Dispatch<React.SetStateAction<BundlePartInput[]>>; dbCategories: { id: number; nama: string; tipe: string }[]; onSparepartCreated?: () => void }>`
- Produces updated props on `ReceiveModalProps` in `components/mtc/po-pr/Modals/ReceiveModal.tsx`:
  - Adds `receiveMode: ReceiveMode`, `setReceiveMode: (val: ReceiveMode) => void`, `receiveParts: BundlePartInput[]`, `setReceiveParts: React.Dispatch<React.SetStateAction<BundlePartInput[]>>`, `dbCategories: { id: number; nama: string; tipe: string }[]`, `onSparepartCreated?: () => void`, `splitError: string | null`.

- [x] **Step 1: Add accessible CSS styles in `app/globals.css`**

Add clean utility rules for:
- `.receive-modal-card` (`background: var(--sf2); border: 1px solid var(--brh); border-radius: var(--r); max-height: calc(100vh - 32px); overflow-y: auto; transition: max-width 0.15s ease;`, honoring `@media (prefers-reduced-motion: reduce)`)
- `.receive-btn-confirm` (`background: #15803d; color: #ffffff; min-height: 44px; font-weight: 700;` with hover `#166534` and disabled state)
- `.receive-focusable:focus-visible` (`outline: 2px solid var(--pur); outline-offset: 2px;`)
- `.split-part-grid` (`display: grid; grid-template-columns: minmax(0, 2fr) 96px 140px 110px 44px; gap: 10px; align-items: end;`) collapsing cleanly at `@media (max-width: 640px)` to 1-2 columns without horizontal overflow and `min-height: 44px` tap targets.

- [x] **Step 2: Create `components/mtc/po-pr/Modals/SplitReceiveSection.tsx`**

Build the focused split-item editor:
- Displays a compact PO value summary (`poQty x poUnitPrice = poTotal`).
- Renders each `BundlePartInput` row in `.split-part-grid`:
  - Sparepart selector with debounced search (`GET /api/mtc/master/sparepart?simple=true&search=...`), showing selected sparepart (`nama`, `id`, `lokasi`, `uom`) with button `Ganti`, or search results dropdown with explicit **loading** ("Mencari suku cadang..."), **empty** ("Tidak ada sparepart cocok. Buat master baru di bawah."), and **error** ("Gagal memuat master sparepart. Coba lagi.") states (`R-27`), preventing duplicate selection of an already-chosen `sparepartId`.
  - Inline collapsible `+ Buat Master Baru` panel right inside the row (Nama Resmi, Kategori, Lokasi SLOC, Satuan UOM, tombol `Simpan & Pilih`) calling `POST /api/mtc/master/sparepart` with loading/error handling and invoking `onSparepartCreated?.()` (zero extra modal popups).
  - Numeric inputs with visible `<label htmlFor>` for `Qty` (`min=1`) and `Harga Satuan (Rp)` (`min=0`).
  - Formatted subtotal (`qty * harga`) and `Hapus` button (`minHeight: 44px`, `aria-label="Hapus komponen N"`, disabled when `parts.length <= 2`).
- `+ Tambah Komponen` button (`minHeight: 44px`, plain text + minimal 16px SVG plus icon `aria-hidden="true"`).
- Allocation bar showing `Total Nilai PO`, `Total Alokasi`, `Selisih` (using explicit text `"Pas"` / `"Kurang Rp ..."` / `"Lebih Rp ..."` alongside semantic green/yellow color, never color alone), plus `Bagi Rata` and `Isi Sisa ke Baris Terakhir` buttons.
- Zero emojis and zero em dashes (`—`, `R-02`, `R-04`).

- [x] **Step 3: Refactor `components/mtc/po-pr/Modals/ReceiveModal.tsx`**

Update `ReceiveModal`:
- Add `useEffect` listening for `Escape` key to close the modal when `showReceiveModal` is true (`R-32`).
- Add `role="dialog"`, `aria-modal="true"`, `aria-labelledby="receive-modal-title"`.
- Dynamically set `maxWidth: receiveMode === 'split' ? 820 : 540`.
- Update `Mode Satuan Pembelian` to 3 `<button type="button">` tabs (`gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))'`):
  1. `Satuan Biasa (Unit/Pcs)`
  2. `Kemasan (Pack/Box/Set)`
  3. `Pecah Item (Multi-Item)`
- When `receiveMode === 'split'`:
  - Render `<SplitReceiveSection ... />` in place of the single-item qty/price inputs.
  - Keep shared fields visible: `Tanggal Penerimaan Fisik`, `Vendor Pembuat PO`, and `Tujuan Akhir Penerimaan` (`Masuk Stok Gudang` | `Langsung Pakai`).
  - Show inline `splitError` alert if validation fails on submit.
- Clean all UI copy inside `ReceiveModal.tsx`: remove decorative emojis (`📥`, `🔩`, `📦`, `⚡`, `📐`, `🧵`, `⚠️`, `✖`), replace close `✖` with a 16px SVG close icon (`aria-hidden="true"`) + `aria-label="Tutup modal"`, replace `—` with `-` (`R-02`), replace `--tx3` text on modal surface with `--tx2` (`R-25`), and apply `.receive-btn-confirm` to the submit button (`minHeight: 44px`).

- [x] **Step 4: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS with zero TypeScript errors and zero new lint errors.

- [x] **Step 5: Commit Task 3**

```bash
git add app/globals.css components/mtc/po-pr/Modals/SplitReceiveSection.tsx components/mtc/po-pr/Modals/ReceiveModal.tsx
git commit -m "feat(mtc): add accessible SplitReceiveSection and Pecah Item mode in ReceiveModal"
```

---

### Task 4: Wire `po-pr/page.tsx` & Render Split Items in `ProcurementGroupList.tsx`

**Files:**
- Modify: `app/mtc/(editor)/po-pr/page.tsx:93-106`, `302-337`, `535-571`, `984-1009`
- Modify: `components/mtc/po-pr/ProcurementGroupList.tsx:1139-1346`

**Interfaces:**
- Consumes from Task 1 (`lib/mtc/bundle-receive.ts`):
  - `BundlePartInput`, `ReceiveMode`, `parseBundleParts`, `validateBundleParts`
- Consumes from Task 3 (`ReceiveModal.tsx`):
  - New props `receiveMode`, `setReceiveMode`, `receiveParts`, `setReceiveParts`, `dbCategories`, `onSparepartCreated`, `splitError`.

- [x] **Step 1: Update `app/mtc/(editor)/po-pr/page.tsx`**

1. Add states `receiveMode` (`useState<ReceiveMode>('unit')`), `receiveParts` (`useState<BundlePartInput[]>([])`), and `splitError` (`useState<string | null>(null)`).
2. In `openReceiveModal(item)`:
   - Reset `splitError(null)`.
   - Check `const existingBundle = parseBundleParts(item.linkedPartsJson)`.
   - If `existingBundle && existingBundle.length > 0`, set `receiveMode('split')` and `receiveParts(existingBundle)` and `setIsStocked(item.isStocked || existingBundle.every(p => !!p.sparepartId))` (Review Focus #3).
   - Otherwise, preserve existing pack detection (`setReceiveMode(hasPackMeta ? 'pack' : 'unit')`) and initialize `receiveParts` with 2 empty rows (`qty: item.qty || 1`, `harga: 0`) so switching to `'split'` starts ready to fill.
3. In `handleModeChange` / `setReceiveMode`: when switching to `'split'`, clear `splitError`, and if `receiveParts.length < 2` initialize 2 empty rows with `receivingItem.qty || 1`; also enable `setIsStocked(true)` by default if user hasn't forced direct use, and ensure `Tujuan Akhir Penerimaan` (`Masuk Stok Gudang`) is NOT disabled in `split` mode even when `receivingItem.sparepartId == null` (Review Focus #3).
4. In `handleReceiveSubmit(e)`:
   - When `receiveMode === 'split'`: validate `receiveParts` via `validateBundleParts(receiveParts)`; if invalid, set `splitError(validation.error)` and return early. Otherwise POST `{ id: receivingItem.id, tanggalTerima: receiveDate, isStocked, harga: receivePrice, vendor: receiveVendor, receivedParts: validation.parts }`.
   - When `receiveMode !== 'split'`: preserve existing single-item / pack payload (`isStocked: isStocked && receivingItem.sparepartId != null`, `isPackMode: receiveMode === 'pack'`, etc.).
5. Pass the new props (`receiveMode`, `setReceiveMode`, `receiveParts`, `setReceiveParts`, `dbCategories`, `onSparepartCreated={fetchSpareparts}`, `splitError`) to `<ReceiveModal />`.

- [x] **Step 2: Update `components/mtc/po-pr/ProcurementGroupList.tsx`**

1. Import `parseBundleParts` from `@/lib/mtc/bundle-receive`.
2. In the `Koneksi Database Resmi MTC (Odoo)` `<td>` (lines 1140-1272):
   - Compute `const bundleParts = parseBundleParts(item.linkedPartsJson)`.
   - If `bundleParts && bundleParts.length > 0`, render a clean `Dipecah ({bundleParts.length} Item)` badge alongside status/PO badges and list each component (`part.nama`, `part.sparepartId`, `Qty: part.qty`, and formatted unit price when `part.harga > 0`) instead of `Unlinked / General`.
3. In the `Qty` `<td>` (lines 1306-1346):
   - If `bundleParts && bundleParts.length > 0`, display `${item.qty} Set/PO` (or `Pcs`) with a concise sublabel `-> ${bundleParts.length} komponen` so pack-mode parsing is cleanly separated from bundle metadata.

- [x] **Step 3: Run typecheck, lint, and unit tests**

Run: `node --test tests/mtc/bundle-receive.test.mjs && npm run typecheck && npm run lint`
Expected: PASS with zero errors.

- [x] **Step 4: Commit Task 4**

```bash
git add app/mtc/(editor)/po-pr/page.tsx components/mtc/po-pr/ProcurementGroupList.tsx
git commit -m "feat(mtc): wire split-item receiving in po-pr page and group list"
```

---

### Task 5: Full Build, Verification & `antislop` Delivery Gate Audit

**Files:**
- Verify all touched files across Tasks 1-4 (no new files unless fixing a gate failure).

- [x] **Step 1: Run full unit test suite, typecheck, lint, and production build**

Run:
```bash
node --test tests/mtc/*.test.mjs
npm run typecheck
npm run lint
npm run build
```
Expected: All unit tests pass, `tsc --noEmit` exits 0, `next lint` passes, and `next build` succeeds cleanly.

- [x] **Step 2: Run live/interactive verification & `antislop` Delivery Gate check**

1. Start dev server (`npm run dev`) or inspect/exercise the `/mtc/po-pr` modal interactively (check opening `Terima Barang` on an unlinked PO item, switching `Satuan Biasa` -> `Kemasan` -> `Pecah Item (Multi-Item)`, modal widening, searching spareparts, loading/empty/error states, inline `+ Buat Master Baru`, `Bagi Rata`, `Isi Sisa`, validation error on incomplete rows, `Tab` focus ring, `Escape` close, mobile viewport `375px` without horizontal overflow, and if a local DB is configured, end-to-end receive & `Batal Terima`).
   - If DB/auth prevents live submission on local environment, record exact observed scope and verify code/API transaction paths alongside rendered modal UI checks (`R-35` honest reporting).
2. Run every item of the `antislop` Delivery Gate (Blocks 1-4) and `antislop-ui` UI Skill Checklist, fixing any `FAIL` before delivering.

- [x] **Step 3: Final commit (if any polish fixes were applied during gate audit)**

```bash
git status
```
Commit any gate-fix changes with a clear message.
