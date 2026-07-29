import zipfile
import xml.etree.ElementTree as ET

z = zipfile.ZipFile('FLG_FORM_MTC_013-00 Stock Opname MTC.xlsx')

sheet_xml = z.read('xl/worksheets/sheet1.xml')
tree = ET.fromstring(sheet_xml)

ns = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

shared_strings = []
if 'xl/sharedStrings.xml' in z.namelist():
    sst_tree = ET.fromstring(z.read('xl/sharedStrings.xml'))
    for elem in sst_tree.iter():
        if elem.tag.endswith('t') and elem.text:
            shared_strings.append(elem.text)

rows = tree.findall('.//ns:row', ns)
print(f"Total rows: {len(rows)}")
for row in rows[-30:]:
    r_idx = row.attrib.get('r')
    row_vals = []
    for cell in row.findall('./ns:c', ns):
        ref = cell.attrib.get('r')
        t = cell.attrib.get('t')
        v_elem = cell.find('./ns:v', ns)
        val = ""
        if v_elem is not None:
            if t == 's':
                idx = int(v_elem.text)
                val = shared_strings[idx] if idx < len(shared_strings) else v_elem.text
            else:
                val = v_elem.text
        row_vals.append(f"{ref}:{val}")
    if any(v.split(':', 1)[1] for v in row_vals):
        print(f"Row {r_idx}:", " | ".join(row_vals))
