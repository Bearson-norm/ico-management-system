import zipfile

z = zipfile.ZipFile('FLG_FORM_MTC_013-00 Stock Opname MTC.xlsx')
print("All files in zip:")
for f in z.namelist():
    if 'media' in f or 'drawing' in f or 'sheet' in f:
        print("-", f)

# Extract media files if any
media_files = [f for f in z.namelist() if f.startswith('xl/media/')]
print("Media files count:", len(media_files))
for m in media_files:
    print("Extracting media:", m)
    z.extract(m, 'public/')
