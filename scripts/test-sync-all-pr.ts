import { prisma } from '../lib/prisma';

const sessionId = 'a63c41331eacbddc78421b46e350282af18ee085';
const targetPr = 'PR03773';

function mapOdooStateToLocal(state: string): string {
  switch (state) {
    case 'draft': return 'RFQ';
    case 'sent': return 'RFQ';
    case 'to approve': return 'TO_APPROVE';
    case 'purchase': return 'PO';
    case 'done': return 'PO';
    case 'cancel': return 'CANCELLED';
    default: return 'DRAFT';
  }
}

async function queryOdoo(model: string, method: string, args: any[], kwargs: any = {}) {
  const response = await fetch("https://foomx.odoo.com/web/dataset/call_kw", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": `session_id=${sessionId}`
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { model, method, args, kwargs }
    })
  });
  
  const json = await response.json() as any;
  if (json.error) {
    throw new Error(json.error.message || JSON.stringify(json.error));
  }
  return json.result;
}

async function findOdooPR(docName: string, credentials: any) {
  const reqs = await queryOdoo(
    'purchase.requisition',
    'search_read',
    [[['name', '=', docName]]],
    { fields: ['id', 'name', 'state', 'create_date'], limit: 1 }
  );
  if (reqs && reqs.length > 0) {
    return { ...reqs[0], model: 'purchase.requisition' };
  }

  const requests = await queryOdoo(
    'purchase.request',
    'search_read',
    [[['name', '=', docName]]],
    { fields: ['id', 'name', 'state', 'create_date'], limit: 1 }
  );
  if (requests && requests.length > 0) {
    return { ...requests[0], model: 'purchase.request' };
  }

  return null;
}

async function fetchChatterLogs(model: string, resId: number, phase: string, credentials: any) {
  try {
    const messages = await queryOdoo(
      'mail.message',
      'search_read',
      [[
        ['model', '=', model],
        ['res_id', '=', resId]
      ]],
      {
        fields: ['date', 'body', 'author_id'],
        order: 'date desc',
        limit: 15
      }
    );
    return messages || [];
  } catch {
    return [];
  }
}

function findBestMatchedLine(lines: any[], item: any): any {
  if (!lines || lines.length === 0) return null;

  const odooItemName = item.sparepart?.nama?.toLowerCase()?.trim() || '';
  const originalName = item.originalName?.toLowerCase()?.trim() || '';
  const targetQty = Number(item.qty) || 0;

  const originalDigits = originalName.match(/\b\d+\b/g) || [];

  let bestLine = null;
  let bestScore = -1;

  for (const line of lines) {
    const prodName = Array.isArray(line.product_id) ? line.product_id[1]?.toLowerCase()?.trim() : '';
    const lineName = line.name?.toLowerCase()?.trim() || '';
    const lineQty = Number(line.product_qty) || 0;

    let score = 0;

    if (originalName && (originalName === prodName || originalName === lineName)) {
      score += 100;
    }
    if (odooItemName && (odooItemName === prodName || odooItemName === lineName)) {
      score += 80;
    }

    if (prodName && prodName.length > 3) {
      if (originalName.includes(prodName) || prodName.includes(originalName)) {
        score += 20;
      }
      if (odooItemName && (odooItemName.includes(prodName) || prodName.includes(odooItemName))) {
        score += 15;
      }
    }

    if (lineName && lineName.length > 3) {
      if (originalName.includes(lineName) || lineName.includes(originalName)) {
        score += 20;
      }
      if (odooItemName && (odooItemName.includes(lineName) || lineName.includes(odooItemName))) {
        score += 15;
      }
    }

    if (originalDigits.length > 0) {
      let digitMatchCount = 0;
      for (const d of originalDigits) {
        const regex = new RegExp('\\b' + d + '\\b');
        if (regex.test(prodName) || regex.test(lineName)) {
          digitMatchCount++;
        }
      }
      score += digitMatchCount * 12;
    }

    if (targetQty > 0 && targetQty === lineQty) {
      score += 8;
    }

    if (score > 0 && score > bestScore) {
      bestScore = score;
      bestLine = line;
    }
  }

  return bestLine;
}

function hasActualChanges(existingItem: any, updateData: any): boolean {
  for (const key of Object.keys(updateData)) {
    const newVal = updateData[key];
    const oldVal = existingItem[key];

    if (newVal === undefined) continue;

    if (newVal === null && oldVal === null) continue;
    if (newVal === null || oldVal === null) return true;

    if (newVal instanceof Date || oldVal instanceof Date) {
      const newTime = newVal instanceof Date ? newVal.getTime() : new Date(newVal).getTime();
      const oldTime = oldVal instanceof Date ? oldVal.getTime() : new Date(oldVal).getTime();
      if (newTime !== oldTime) return true;
    } else if (key === 'harga') {
      if (Number(newVal) !== Number(oldVal)) return true;
    } else {
      if (newVal !== oldVal) return true;
    }
  }
  return false;
}

async function main() {
  const trackingItems = await prisma.procurementTracking.findMany({
    where: { nomorPr: targetPr },
    include: { sparepart: true }
  });

  console.log(`Ditemukan ${trackingItems.length} item lokal untuk ${targetPr}.`);

  const groupedItems: { [docName: string]: typeof trackingItems } = {};
  for (const item of trackingItems) {
    const prNo = item.nomorPr?.trim();
    const poNo = item.nomorPo?.trim();
    const docName = prNo || poNo;
    if (!docName) continue;
    if (!groupedItems[docName]) {
      groupedItems[docName] = [];
    }
    groupedItems[docName].push(item);
  }

  const odooOptions = {};

  const fetchOdooDataForGroup = async (docName: string, prNo: string | undefined, poNo: string | undefined) => {
    console.log(`Mencari Odoo untuk ${docName}...`);
    let odooPos = await queryOdoo(
      'purchase.order',
      'search_read',
      [[
        '|',
        '|',
        ['name', '=', docName],
        ['origin', '=', docName],
        ['partner_ref', '=', docName]
      ]],
      {
        fields: ['id', 'name', 'state', 'amount_total', 'partner_id', 'date_order', 'origin', 'partner_ref', 'create_date'],
        limit: 50
      }
    );

    if (!odooPos || odooPos.length === 0) {
      return null;
    }

    const allPoLines: any[] = [];
    const allLogs: any[] = [];
    let prCreateDate: Date | null = null;
    const poGrStatusMap = new Map<number, { isGrDone: boolean, odooGrDate: Date | null, odooGrLink: string | null }>();

    for (const odooPo of odooPos) {
      const poId = odooPo.id;
      const poName = odooPo.name;
      const odooState = odooPo.state;
      const localStatusPr = mapOdooStateToLocal(odooState);
      const vendorName = Array.isArray(odooPo.partner_id) ? odooPo.partner_id[1] : null;
      const amountTotal = odooPo.amount_total || 0;

      const [poLogs, poLines, odooGrs] = await Promise.all([
        fetchChatterLogs('purchase.order', poId, 'PO', odooOptions).catch(() => []),
        queryOdoo(
          'purchase.order.line',
          'search_read',
          [[['order_id', '=', poId]]],
          {
            fields: ['name', 'price_unit', 'product_qty', 'qty_received', 'product_id'],
            limit: 50
          }
        ).catch(() => []),
        queryOdoo(
          'good.received',
          'search_read',
          [[['purchase_id', '=', poId]]],
          {
            fields: ['id', 'state', 'write_date', 'name'],
            limit: 1
          }
        ).catch(() => [])
      ]);

      allLogs.push(...poLogs);

      for (const line of poLines) {
        line.parentPoName = poName;
        line.parentPoId = poId;
        line.parentPoState = odooState;
        line.parentLocalStatusPr = localStatusPr;
        line.parentVendorName = vendorName;
        line.parentAmountTotal = amountTotal;
      }
      allPoLines.push(...poLines);

      let odooGrDate: Date | null = null;
      let isGrDone = false;
      let odooGrLink: string | null = null;

      if (odooGrs && odooGrs.length > 0) {
        const odooGr = odooGrs[0];
        odooGrLink = `https://foomx.odoo.com/web#id=${odooGr.id}&model=good.received&view_type=form`;
        if (odooGr.state === 'done') {
          isGrDone = true;
          if (odooGr.write_date) {
            const parsedGrDate = new Date(odooGr.write_date);
            if (!isNaN(parsedGrDate.getTime())) {
              odooGrDate = parsedGrDate;
            }
          }
        }
      }
      poGrStatusMap.set(poId, { isGrDone, odooGrDate, odooGrLink });
    }

    const originDoc = odooPos[0].origin?.trim();
    const prTargets = Array.from(new Set([originDoc, prNo].filter(Boolean) as string[]));
    for (const target of prTargets) {
      try {
        const matchedPR = await findOdooPR(target, odooOptions);
        if (matchedPR) {
          const prLogs = await fetchChatterLogs(matchedPR.model, matchedPR.id, 'PR', odooOptions).catch(() => []);
          allLogs.push(...prLogs);

          if (matchedPR.create_date) {
            const parsedPrDate = new Date(matchedPR.create_date);
            if (!isNaN(parsedPrDate.getTime())) {
              prCreateDate = parsedPrDate;
            }
          }
        }
      } catch (errPRLogs) {
        console.error(`Gagal mengambil log PR untuk target ${target}:`, errPRLogs);
      }
    }

    const seen = new Set();
    const deduplicatedLogs = allLogs.filter(log => {
      const key = `${log.date}_${log.author}_${log.body}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    deduplicatedLogs.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const chatterNotes = deduplicatedLogs.length > 0 ? JSON.stringify(deduplicatedLogs) : '';

    if (!prCreateDate && deduplicatedLogs.length > 0) {
      const oldestLog = deduplicatedLogs[deduplicatedLogs.length - 1];
      const parsedLogDate = new Date(oldestLog.date);
      if (!isNaN(parsedLogDate.getTime())) {
        prCreateDate = parsedLogDate;
      }
    }

    return {
      isPrOnly: false,
      odooPos,
      allPoLines,
      poGrStatusMap,
      prCreateDate,
      chatterNotes
    };
  };

  for (const docName of Object.keys(groupedItems)) {
    const items = groupedItems[docName];
    const data = await fetchOdooDataForGroup(docName, targetPr, undefined);
    if (!data) {
      console.log(`Data Odoo tidak ditemukan untuk ${docName}`);
      continue;
    }

    console.log(`Memulai transaksi update untuk ${docName}...`);
    const { odooPos, allPoLines, poGrStatusMap, prCreateDate, chatterNotes } = data as any;

    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        let matchedLine = null;
        if (allPoLines.length > 0) {
          matchedLine = findBestMatchedLine(allPoLines, item);
        }

        const targetPo = matchedLine 
          ? odooPos.find((p: any) => p.id === matchedLine.parentPoId)
          : odooPos[0];
        const poId = targetPo.id;
        const poName = targetPo.name;
        const odooState = targetPo.state;
        const localStatusPr = mapOdooStateToLocal(odooState);
        const vendorName = Array.isArray(targetPo.partner_id) ? targetPo.partner_id[1] : null;
        const amountTotal = targetPo.amount_total || 0;
        const odooPoUrl = `https://foomx.odoo.com/web#id=${poId}&model=purchase.order&view_type=form`;

        const grStatus = poGrStatusMap.get(poId) || { isGrDone: false, odooGrDate: null, odooGrLink: null };
        const { isGrDone, odooGrDate, odooGrLink } = grStatus;

        let matchedPrice = matchedLine ? Number(matchedLine.price_unit) || 0 : 0;
        let matchedQty = matchedLine ? Number(matchedLine.product_qty) || 0 : 0;
        let qtyReceived = matchedLine ? Number(matchedLine.qty_received) || 0 : 0;

        const updateData: any = {
          statusPr: localStatusPr,
          nomorPo: poName,
          odooNotes: chatterNotes || null,
        };
        if (vendorName) updateData.vendor = vendorName;

        if (prCreateDate) {
          updateData.tanggalList = prCreateDate;
        }
        
        if (!item.linkReferences) {
          updateData.linkReferences = odooPoUrl;
        }

        if (matchedPrice > 0) {
          updateData.harga = matchedPrice;
        } else if (amountTotal > 0 && (!item.harga || Number(item.harga) === 0)) {
          updateData.harga = amountTotal;
        }

        const siblingItems = await tx.procurementTracking.findMany({
          where: {
            nomorPo: poName,
            originalName: item.originalName,
            nomorPr: item.nomorPr
          }
        });

        const alreadyReceivedQty = siblingItems
          .filter((sib: any) => sib.statusPo === 'DONE' && sib.id !== item.id)
          .reduce((sum: number, sib: any) => sum + sib.qty, 0);

        const newReceiptQty = qtyReceived - alreadyReceivedQty;
        let finalIsGrDone = isGrDone;
        
        const isPartialOdooGr = !!(matchedLine && qtyReceived > 0 && qtyReceived < matchedQty);

        if (matchedQty > 0 && item.qty === Math.round(matchedQty)) {
          updateData.qty = Math.round(matchedQty);
        }

        if (newReceiptQty > 0 && newReceiptQty < item.qty) {
          updateData.qty = newReceiptQty;
          updateData.statusPo = 'DONE';
          if (odooGrDate) updateData.tanggalTerima = odooGrDate;
          if (odooGrLink) updateData.linkGr = odooGrLink;
          finalIsGrDone = true;

          const remainingQty = item.qty - newReceiptQty;
          await tx.procurementTracking.create({
            data: {
              fbIndex: item.fbIndex,
              originalName: item.originalName,
              sparepartId: item.sparepartId,
              keterangan: item.keterangan,
              penggunaanBulan: item.penggunaanBulan,
              kontrak3Bulan: item.kontrak3Bulan,
              tanggalList: prCreateDate || item.tanggalList,
              qty: remainingQty,
              productCategory: item.productCategory,
              reason: item.reason,
              urgency: item.urgency,
              linkReferences: odooPoUrl,
              vendor: vendorName || item.vendor,
              harga: matchedPrice > 0 ? matchedPrice : item.harga,
              nomorPr: item.nomorPr,
              statusPr: localStatusPr,
              statusPo: localStatusPr === 'APPROVED' ? 'PO' : localStatusPr,
              nomorPo: poName,
              odooNotes: chatterNotes || null,
              linkedPartsJson: item.linkedPartsJson
            }
          });
          console.log(`Split GR created for item ${item.originalName}: remaining ${remainingQty}`);
        } else if (newReceiptQty >= item.qty || (newReceiptQty > 0 && isGrDone && !isPartialOdooGr)) {
          updateData.statusPo = 'DONE';
          if (odooGrDate) {
            updateData.tanggalTerima = odooGrDate;
          }
          if (odooGrLink) {
            updateData.linkGr = odooGrLink;
          }
          finalIsGrDone = true;
        } else {
          // If none match, revert to PO / not DONE, but preserve physical receipt date
          updateData.statusPo = 'PO';
          updateData.tanggalTerima = item.tanggalTerima || null;
        }

        const hasChanges = hasActualChanges(item, updateData);
        if (hasChanges) {
          console.log(`Mengupdate item ${item.id} (${item.originalName}): nomorPo=${poName}, vendor=${vendorName}, statusPo=${updateData.statusPo}`);
          await tx.procurementTracking.update({
            where: { id: item.id },
            data: updateData
          });
        } else {
          console.log(`Tidak ada perubahan untuk item ${item.id} (${item.originalName}).`);
        }
      }
    });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
