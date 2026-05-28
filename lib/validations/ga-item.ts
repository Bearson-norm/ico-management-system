import { z } from 'zod';

export const GaItemUpdateSchema = z.object({
  nama: z.string().min(1, 'Nama barang wajib'),
  kodeBarang: z.string().min(1, 'Kode barang wajib'),
  lokasi: z.string().optional().nullable(),
  uom: z.string().min(1).default('Pcs'),
  harga: z.coerce.number().min(0),
  minQty: z.coerce.number().int().min(0),
  maxQty: z.coerce.number().int().min(0).optional().nullable(),
  kategoriId: z.coerce.number().int().positive().optional().nullable(),
  aktif: z.boolean().optional(),
});
