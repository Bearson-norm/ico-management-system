import { z } from 'zod';

const BaseIn = z.object({
  tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  purchaseType: z.string().optional().default(''),
  vendor: z.string().optional().default(''),
  picNama: z.string().min(1, 'PIC penerima wajib diisi'),
  keterangan: z.string().optional().default(''),
});

export const GaStockInExistingSchema = BaseIn.extend({
  jenis: z.literal('existing'),
  items: z
    .array(
      z.object({
        itemId: z.string().min(1),
        qty: z.number().int().positive(),
        harga: z.number().min(0).optional().default(0),
      })
    )
    .min(1),
});

export const GaStockInNewSchema = BaseIn.extend({
  jenis: z.literal('new'),
  nama: z.string().min(2),
  kategoriId: z.number().int().positive().nullable().optional(),
  lokasi: z.string().optional().default(''),
  kodeBarang: z.string().optional().default(''),
  harga: z.number().min(0).default(0),
  qty: z.number().int().positive(),
  minQty: z.number().int().min(0).default(0),
  maxQty: z.number().int().min(0).optional().nullable(),
  uom: z.string().optional().default('Pcs'),
});

export const GaStockInSchema = z.discriminatedUnion('jenis', [GaStockInExistingSchema, GaStockInNewSchema]);

export const GaStockOutSchema = z.object({
  tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  keterangan: z.string().optional().default(''),
  items: z
    .array(
      z.object({
        itemId: z.string().min(1),
        qty: z.number().int().positive(),
        picNama: z.string().min(1, 'PIC penerima wajib diisi per barang'),
      })
    )
    .min(1),
});
