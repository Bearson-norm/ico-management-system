import sys
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

def run_cmd(cmd):
    print(f"\n--- {cmd} ---")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='ignore')
    err = stderr.read().decode('utf-8', errors='ignore')
    if out:
        print(out)
    if err:
        print("ERR:", err)
    return out

sql = '''
ALTER TABLE opname_item DROP CONSTRAINT IF EXISTS opname_item_sparepart_id_fkey;

UPDATE sparepart SET id = 'MTC-SP-352' WHERE id = 'SP0001';
UPDATE opname_item SET sparepart_id = 'MTC-SP-352' WHERE sparepart_id = 'SP0001';

UPDATE sparepart SET id = 'MTC-SP-353' WHERE id = 'SP0002';
UPDATE opname_item SET sparepart_id = 'MTC-SP-353' WHERE sparepart_id = 'SP0002';

UPDATE sparepart SET id = 'MTC-SP-354' WHERE id = 'SP0003';
UPDATE opname_item SET sparepart_id = 'MTC-SP-354' WHERE sparepart_id = 'SP0003';

UPDATE sparepart SET id = 'MTC-SP-355' WHERE id = 'SP0004';
UPDATE opname_item SET sparepart_id = 'MTC-SP-355' WHERE sparepart_id = 'SP0004';

UPDATE sparepart SET id = 'MTC-SP-356' WHERE id = 'SP0005';
UPDATE opname_item SET sparepart_id = 'MTC-SP-356' WHERE sparepart_id = 'SP0005';

UPDATE sparepart SET id = 'MTC-SP-357' WHERE id = 'SP0006';
UPDATE opname_item SET sparepart_id = 'MTC-SP-357' WHERE sparepart_id = 'SP0006';

UPDATE sparepart SET id = 'MTC-SP-358' WHERE id = 'SP0007';
UPDATE opname_item SET sparepart_id = 'MTC-SP-358' WHERE sparepart_id = 'SP0007';

UPDATE sparepart SET id = 'MTC-SP-359' WHERE id = 'SP0008';
UPDATE opname_item SET sparepart_id = 'MTC-SP-359' WHERE sparepart_id = 'SP0008';

UPDATE sparepart SET id = 'MTC-SP-360' WHERE id = 'SP0009';
UPDATE opname_item SET sparepart_id = 'MTC-SP-360' WHERE sparepart_id = 'SP0009';

UPDATE sparepart SET id = 'MTC-SP-361' WHERE id = 'SP0010';
UPDATE opname_item SET sparepart_id = 'MTC-SP-361' WHERE sparepart_id = 'SP0010';

UPDATE sparepart SET id = 'MTC-SP-362' WHERE id = 'SP0011';
UPDATE opname_item SET sparepart_id = 'MTC-SP-362' WHERE sparepart_id = 'SP0011';

ALTER TABLE opname_item ADD CONSTRAINT opname_item_sparepart_id_fkey FOREIGN KEY (sparepart_id) REFERENCES sparepart(id) ON UPDATE CASCADE ON DELETE SET NULL;
'''

cmd = f'''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "{sql.replace(chr(10), ' ')}" '''
run_cmd(cmd)

run_cmd('''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "SELECT id, nama, lokasi FROM sparepart WHERE id LIKE 'MTC-SP-35%' OR id LIKE 'MTC-SP-36%';" ''')
run_cmd('''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "SELECT id, sparepart_id, nama_item, is_new_item FROM opname_item WHERE sparepart_id LIKE 'MTC-SP-35%' OR sparepart_id LIKE 'MTC-SP-36%';" ''')

ssh.close()
