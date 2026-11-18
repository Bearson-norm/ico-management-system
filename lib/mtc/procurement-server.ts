import {
  buildManuallyArchivedJson,
  buildRestoredFromArchiveJson,
  deriveSparepartProcurementSummary,
  isManuallyArchived,
  parsePackMetadata,
} from './procurement-utils';

// Include statusPo: null explicitly because PostgreSQL NOT IN excludes NULL rows.
export const PENDING_ARRIVAL_WHERE = {
  tanggalTerima: null,
  OR: [{ statusPo: null }, { statusPo: { notIn: ['DONE', 'CANCELLED'] } }],
  statusPr: { notIn: ['CANCELLED', 'REJECTED', 'RECEIVED'] },
};

export type SyncSparepartOptions = {
  odooNotes?: string | null;
  candidateHarga?: number | null;
  allowHargaUpdate?: boolean;
  leadTimeReceiptDate?: Date | null;
  leadTimeStartDate?: Date | null;
  updateLeadTime?: boolean;
};

/** Recompute Sparepart purchasing summary, optional price, and optional EMA lead time from active trackings. */
export async function syncSparepartProcurement(
  db: any,
  sparepartId: string,
  options?: SyncSparepartOptions
) {
  const pendingItems = await db.procurementTracking.findMany({
    where: {
      sparepartId,
      ...PENDING_ARRIVAL_WHERE,
    },
    orderBy: { tanggalList: 'asc' },
  });

  const summary = deriveSparepartProcurementSummary(pendingItems);

  const spUpdateData: Record<string, any> = {
    purchasingStatus: summary.purchasingStatus,
    purchasingQty: summary.purchasingQty,
    purchasingNoPr: summary.purchasingNoPr,
    purchasingNoPo: summary.purchasingNoPo,
  };

  if (summary.purchasingQty === 0) {
    spUpdateData.prDate = null;
    spUpdateData.poDate = null;
  }

  if (options?.odooNotes !== undefined) {
    spUpdateData.odooNotes = options.odooNotes;
  }

  if (options?.allowHargaUpdate && options.candidateHarga != null && Number(options.candidateHarga) > 0) {
    spUpdateData.harga = Number(Number(options.candidateHarga).toFixed(2));
  }

  if (options?.updateLeadTime && options.leadTimeReceiptDate && options.leadTimeStartDate) {
    const sp = await db.sparepart.findUnique({
      where: { id: sparepartId },
      select: { avgLeadTime: true, maxLeadTime: true },
    });
    if (sp) {
      const elapsedMs =
        new Date(options.leadTimeReceiptDate).getTime() - new Date(options.leadTimeStartDate).getTime();
      const elapsedDays = Math.max(1, elapsedMs / (1000 * 60 * 60 * 24));
      spUpdateData.avgLeadTime =
        sp.avgLeadTime === 0
          ? Number(elapsedDays.toFixed(2))
          : Number((sp.avgLeadTime * 0.8 + elapsedDays * 0.2).toFixed(2));
      spUpdateData.maxLeadTime = Math.max(sp.maxLeadTime, Math.round(elapsedDays));
    }
  }

  await db.sparepart.update({
    where: { id: sparepartId },
    data: spUpdateData,
  });

  return { summary, spUpdateData };
}

export type ArchiveOrReopenOptions = {
  action: 'archive' | 'reopen';
  ids: number[];
  reason?: string | null;
};

/** Bulk-archive stale unreceived items (marking linkedPartsJson so sync will not reopen) or reopen manually archived items, keeping Sparepart summaries synchronized. */
export async function archiveOrReopenProcurementItems(
  db: any,
  options: ArchiveOrReopenOptions
): Promise<{ processedIds: number[]; skippedIds: number[]; touchedSparepartIds: string[] }> {
  const cleanIds = Array.from(
    new Set((options.ids || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))
  );
  if (cleanIds.length === 0) {
    return { processedIds: [], skippedIds: [], touchedSparepartIds: [] };
  }

  const rows = await db.procurementTracking.findMany({
    where: { id: { in: cleanIds } },
  });

  const processedIds: number[] = [];
  const skippedIds: number[] = [];
  const touchedSet = new Set<string>();

  for (const row of rows) {
    const spPr = (row.statusPr || '').toUpperCase();
    const spPo = (row.statusPo || '').toUpperCase();

    if (options.action === 'archive') {
      const alreadyDoneOrCancelled =
        Boolean(row.tanggalTerima) ||
        spPo === 'DONE' ||
        spPo === 'CANCELLED' ||
        spPr === 'RECEIVED' ||
        spPr === 'DONE' ||
        spPr === 'CLOSED' ||
        spPr === 'CANCELLED' ||
        spPr === 'REJECTED';
      if (alreadyDoneOrCancelled) {
        skippedIds.push(row.id);
        continue;
      }

      const archivedJson = buildManuallyArchivedJson(
        row.linkedPartsJson,
        { statusPr: row.statusPr, statusPo: row.statusPo },
        options.reason || 'Ditutup manual dari daftar PO/PR lama'
      );

      await db.procurementTracking.update({
        where: { id: row.id },
        data: {
          statusPr: 'CANCELLED',
          statusPo: 'CANCELLED',
          linkedPartsJson: archivedJson,
        },
      });
      processedIds.push(row.id);
      if (row.sparepartId) touchedSet.add(row.sparepartId);
    } else {
      if (!isManuallyArchived(row.linkedPartsJson)) {
        skippedIds.push(row.id);
        continue;
      }

      const meta = parsePackMetadata(row.linkedPartsJson);
      const nextStatusPr = meta?.prevStatusPr || (row.nomorPo ? 'PO' : 'DRAFT');
      const nextStatusPo =
        meta?.prevStatusPo !== undefined ? meta.prevStatusPo : row.nomorPo ? 'PO' : null;
      const restoredJson = buildRestoredFromArchiveJson(row.linkedPartsJson);

      await db.procurementTracking.update({
        where: { id: row.id },
        data: {
          statusPr: nextStatusPr,
          statusPo: nextStatusPo,
          linkedPartsJson: restoredJson,
        },
      });
      processedIds.push(row.id);
      if (row.sparepartId) touchedSet.add(row.sparepartId);
    }
  }

  const touchedSparepartIds = Array.from(touchedSet);
  for (const spId of touchedSparepartIds) {
    await syncSparepartProcurement(db, spId);
  }

  return { processedIds, skippedIds, touchedSparepartIds };
}
