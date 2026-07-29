async function main() {
  const url = 'https://msic.moof-set.web.id/api/mtc/procurement?archived=all';
  console.log("Fetching live VPS production API from:", url);

  try {
    const res = await fetch(url);
    const json: any = await res.json();
    console.log("Live VPS Response status:", res.status);
    console.log("Live VPS Data Success:", json.success);
    if (json.data) {
      console.log(`Live VPS returned ${json.data.length} items.`);

      // Check if odooNotes is present in the response items
      const sampleItem = json.data[0];
      console.log("Sample item keys from Live VPS:", Object.keys(sampleItem));
      console.log("Is 'hasOdooNotes' present in live VPS response?", 'hasOdooNotes' in sampleItem);
      console.log("Is 'odooNotes' present in live VPS response?", 'odooNotes' in sampleItem && sampleItem.odooNotes !== undefined);

      // Check Kabel Tis in live VPS response
      const kabelTis = json.data.filter((i: any) => i.originalName && i.originalName.toLowerCase().includes('kabel tis'));
      console.log(`Live VPS has ${kabelTis.length} 'Kabel Tis' items.`);
      kabelTis.forEach((k: any, idx: number) => {
        console.log(`${idx + 1}. [ID:${k.id}] PR: ${k.nomorPr} | PO: ${k.nomorPo} | Name: "${k.originalName}" | Qty: ${k.qty} | Harga: ${k.harga}`);
      });
    }
  } catch (e) {
    console.error("Error fetching live VPS:", e);
  }
}

main();
