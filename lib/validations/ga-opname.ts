import { z } from 'zod';

export const GaOpnameCreateSchema = z.object({
  periodeNama: z.string().min(2, 'Nama periode wajib'),
  tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const GaOpnameUpdateLinesSchema = z.object({
  lines: z
    .array(
      z.object({
        id: z.number().int().positive(),
        qtyFisik: z.number().int().min(0).nullable(),
        picNama: z.string().optional(),
      })
    )
    .min(1),
});

export const GaOpnamePostModeSchema = z.enum(['in_out', 'adj']);

export const GaOpnamePostSchema = z.object({
  tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  picNama: z.string().min(1, 'PIC penyesuaian wajib'),
  postMode: GaOpnamePostModeSchema.default('in_out'),
});
