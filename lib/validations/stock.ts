import { z } from 'zod';

// ─── Stock OUT ────────────────────────────────────────────────────────────────
export const StockOutSchema = z.object({
  tanggal:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  picId:      z.number().int().positive('PIC wajib dipilih'),
  noReport:   z.string().optional().default(''),
  keterangan: z.string().optional().default(''),
  items: z.array(z.object({
    sparepartId: z.string().min(1, 'Item ID wajib diisi'),
    qty:         z.number().int().positive('Qty harus > 0'),
  })).min(1, 'Tambah minimal 1 barang'),
});

// ─── Stock IN ─────────────────────────────────────────────────────────────────
const BaseInSchema = z.object({
  tanggal:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  purchaseType: z.string().optional().default(''),
  vendor:       z.string().optional().default(''),
});

export const StockInExistingSchema = BaseInSchema.extend({
  jenis: z.literal('existing'),
  items: z.array(z.object({
    sparepartId: z.string().min(1),
    qty:         z.number().int().positive(),
    harga:       z.number().min(0).optional().default(0),
  })).min(1, 'Tambah minimal 1 barang'),
});

export const StockInNewSchema = BaseInSchema.extend({
  jenis:    z.literal('new'),
  nama:     z.string().min(2, 'Nama barang minimal 2 karakter'),
  kategoriId: z.number().int().positive().nullable().optional(),
  lokasi:   z.string().optional().default(''),
  harga:    z.number().min(0).default(0),
  qty:      z.number().int().positive(),
  minQty:   z.number().int().min(0).default(0),
  mesinIds: z.array(z.string()).optional(),
});

export const StockInLogSchema = BaseInSchema.extend({
  jenis:  z.literal('log'),
  nama:   z.string().min(2, 'Nama barang minimal 2 karakter'),
  harga:  z.number().min(0).default(0),
  qty:    z.number().int().positive(),
});

export const StockInSchema = z.discriminatedUnion('jenis', [
  StockInExistingSchema,
  StockInNewSchema,
  StockInLogSchema,
]);

export type StockOutInput    = z.infer<typeof StockOutSchema>;
export type StockInExisting  = z.infer<typeof StockInExistingSchema>;
export type StockInNew       = z.infer<typeof StockInNewSchema>;
export type StockInLog       = z.infer<typeof StockInLogSchema>;
