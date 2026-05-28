import { z } from 'zod';

export const ReportSchema = z.object({
  tipe:    z.enum(['CM', 'PM', 'OH']),
  tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal: YYYY-MM-DD'),
  start:   z.string().regex(/^\d{2}:\d{2}$/, 'Format waktu: HH:MM'),
  finish:  z.string().regex(/^\d{2}:\d{2}$/, 'Format waktu: HH:MM'),
  shift:   z.number().int().min(1).max(3).nullable().optional(),
  mesinId: z.number().int().positive('Mesin wajib dipilih'),
  keluhan: z.string().min(3, 'Keluhan minimal 3 karakter'),
  issue:   z.string().min(3, 'Issue minimal 3 karakter'),
  action:  z.string().min(3, 'Action taken minimal 3 karakter'),
  kategoriId: z.number().int().positive().nullable().optional(),
  picId:   z.number().int().positive('PIC wajib dipilih'),
  spareparts: z.array(z.object({
    sparepartId: z.string().min(1),
    qty:         z.number().int().positive('Qty harus > 0'),
  })).optional().default([]),
});

export type ReportInput = z.infer<typeof ReportSchema>;
