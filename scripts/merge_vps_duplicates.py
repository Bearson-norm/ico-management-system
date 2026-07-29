import paramiko

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

def run_cmd(cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    return stdout.read().decode('utf-8', errors='ignore')

# Batch merge duplicates on VPS
sql_merge = """
BEGIN;

-- 1. Transfer _MesinToSparepart from uppercase duplicates to canonical TitleCase machine
INSERT INTO "_MesinToSparepart" ("A", "B")
SELECT target.id, rel."B"
FROM "_MesinToSparepart" rel
JOIN mesin src ON rel."A" = src.id
JOIN mesin target ON LOWER(TRIM(src.nama)) = LOWER(TRIM(target.nama)) AND target.tipe = 'sparepart' AND target.id != src.id
WHERE target.id = (
    SELECT min(id) FROM mesin WHERE LOWER(TRIM(nama)) = LOWER(TRIM(src.nama)) AND tipe = 'sparepart'
)
ON CONFLICT ("A", "B") DO NOTHING;

-- 2. Remove links from non-canonical machines
DELETE FROM "_MesinToSparepart" rel
WHERE rel."A" IN (
    SELECT m.id FROM mesin m
    WHERE m.tipe = 'sparepart'
    AND m.id NOT IN (
        SELECT min(id) FROM mesin WHERE tipe = 'sparepart' GROUP BY LOWER(TRIM(nama))
    )
);

-- 3. Delete non-canonical duplicate machines
DELETE FROM mesin m
WHERE m.tipe = 'sparepart'
AND m.id NOT IN (
    SELECT min(id) FROM mesin WHERE tipe = 'sparepart' GROUP BY LOWER(TRIM(nama))
);

COMMIT;
"""

sftp = ssh.open_sftp()
with sftp.file('/tmp/merge_dupes.sql', 'w') as f:
    f.write(sql_merge)
sftp.close()

run_cmd('PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -f /tmp/merge_dupes.sql')

# Final rekap
rekap = run_cmd('''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "SELECT m.id, m.nama, m.tipe, count(s.id) AS total_item FROM mesin m JOIN \\"_MesinToSparepart\\" rel ON rel.\\"A\\" = m.id JOIN sparepart s ON rel.\\"B\\" = s.id WHERE m.tipe = 'sparepart' GROUP BY m.id, m.nama, m.tipe ORDER BY total_item DESC;" ''')
print("\n=== REKAP FINAL MESIN BOM & JUMLAH SPAREPART DI VPS ===")
print(rekap.encode('ascii', errors='backslashreplace').decode('ascii'))

ssh.close()
