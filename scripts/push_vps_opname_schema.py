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
        print(out)
    if err:
        print("ERR:", err)
    return out

print("--- CREATING OPNAME TABLES ON VPS MTC DB ---")
sql = """
CREATE TABLE IF NOT EXISTS opname_session (
    id SERIAL PRIMARY KEY,
    judul VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
    lokasi VARCHAR(255),
    catatan TEXT,
    created_by_id INT,
    approved_by VARCHAR(255),
    approved_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS opname_item (
    id SERIAL PRIMARY KEY,
    session_id INT NOT NULL REFERENCES opname_session(id) ON DELETE CASCADE,
    sparepart_id VARCHAR(255) REFERENCES sparepart(id) ON DELETE SET NULL,
    nama_item VARCHAR(255) NOT NULL,
    kategori VARCHAR(255),
    lokasi VARCHAR(255),
    uom VARCHAR(50) NOT NULL DEFAULT 'Pcs',
    qty_sistem INT NOT NULL DEFAULT 0,
    qty_fisik INT,
    selisih INT NOT NULL DEFAULT 0,
    catatan TEXT,
    audited_by VARCHAR(255),
    is_new_item BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
"""

run_cmd(f'''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "{sql}" ''')

print("\n--- VERIFYING TABLES ON VPS ---")
run_cmd('''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "\\dt opname*" ''')

ssh.close()
