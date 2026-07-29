import paramiko

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

def run_cmd(cmd):
    print(f"\n$ {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='ignore')
    err = stderr.read().decode('utf-8', errors='ignore')
    if out:
        print(out.encode('ascii', errors='backslashreplace').decode('ascii'))
    if err:
        print("ERR:", err.encode('ascii', errors='backslashreplace').decode('ascii'))
    return out

# Execute SQL directly on VPS via psql file or command string
sql_script = """
-- 1. Transfer any _MesinToSparepart links from 'keduanya' to the new 'sparepart' machine if name matches
INSERT INTO "_MesinToSparepart" ("A", "B")
SELECT new_m.id, rel."B"
FROM "_MesinToSparepart" rel
JOIN mesin old_m ON rel."A" = old_m.id
JOIN mesin new_m ON LOWER(TRIM(old_m.nama)) = LOWER(TRIM(new_m.nama)) AND new_m.tipe = 'sparepart' AND new_m.id != old_m.id
ON CONFLICT DO NOTHING;

-- 2. Re-link any remaining links to target sparepart machine
UPDATE "_MesinToSparepart" rel
SET "A" = target_m.id
FROM mesin src_m
JOIN mesin target_m ON LOWER(TRIM(src_m.nama)) = LOWER(TRIM(target_m.nama)) AND target_m.tipe = 'sparepart'
WHERE rel."A" = src_m.id AND src_m.id != target_m.id;

-- 3. Delete old duplicate 'keduanya' machines that had their links transferred
DELETE FROM mesin WHERE tipe = 'keduanya' AND nama IN (SELECT nama FROM mesin WHERE tipe = 'sparepart');

-- 4. Update any remaining 'keduanya' machines to 'sparepart'
UPDATE mesin SET tipe = 'sparepart', area = NULL WHERE tipe = 'keduanya';
"""

run_cmd(f"echo \"{sql_script}\" > /tmp/fix_machines.sql")
run_cmd("PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -f /tmp/fix_machines.sql")

print("\n=== REKAP MESIN SPAREPART DENGAN JUMLAH ITEM BOMS DI VPS ===")
run_cmd("""PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "SELECT m.id, m.nama, m.tipe, count(s.id) AS total_item FROM mesin m LEFT JOIN \\"_MesinToSparepart\\" rel ON rel.\\"A\\" = m.id LEFT JOIN sparepart s ON rel.\\"B\\" = s.id WHERE m.tipe = 'sparepart' GROUP BY m.id, m.nama, m.tipe ORDER BY total_item DESC LIMIT 40;" """)

# Dump fresh SQL again
print("\nDumping fresh SQL after cleanup from VPS...")
cmd_dump = '''PGPASSWORD=Admin123 pg_dump -h 127.0.0.1 -p 5433 -U admin -d mtc_db --clean --if-exists'''
stdin, stdout, stderr = ssh.exec_command(cmd_dump)
sql_data = stdout.read().decode('utf-8', errors='ignore')

with open('vps_mtc_dump.sql', 'w', encoding='utf-8') as f:
    f.write(sql_data)

print(f"Dumped fresh {len(sql_data)} bytes to vps_mtc_dump.sql")

ssh.close()
