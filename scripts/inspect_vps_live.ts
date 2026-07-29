async function main() {
  const url = 'https://msic.moof-set.web.id/api/mtc/procurement?archived=all';
  try {
    const res = await fetch(url);
    const json: any = await res.json();
    if (!json.success || !json.data) {
      console.log('Failed:', json);
      return;
    }
    console.log(`Total items on VPS: ${json.data.length}`);
    const prSet = new Set<string>();
    const teItems: any[] = [];
    json.data.forEach((item: any) => {
      if (item.nomorPr) {
        prSet.add(item.nomorPr);
        if (item.nomorPr.startsWith('TE')) {
          teItems.push(item);
        }
      }
    });

    console.log(`Unique PR/TE numbers count: ${prSet.size}`);
    console.log(`Items with TE... number: ${teItems.length}`);
    if (teItems.length > 0) {
      console.log('Sample TE items:', teItems.slice(0, 5).map(i => ({ id: i.id, nomorPr: i.nomorPr, name: i.originalName, statusPr: i.statusPr })));
    }

    console.log('\nSample 10 items from VPS:');
    json.data.slice(0, 10).forEach((i: any) => {
      console.log(`ID:${i.id} | PR:${i.nomorPr} | PO:${i.nomorPo} | Status:${i.statusPr} | Name:${i.originalName}`);
    });
  } catch (e) {
    console.error('Error fetching live VPS:', e);
  }
}

main();
