import paramiko

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

print("Connecting to VPS to dump mtc_db from port 5433...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

# 1. Update tipe 'keduanya' -> 'sparepart' on VPS
print("\nUpdating mesin tipe 'keduanya' -> 'sparepart' on VPS...")
cmd_update = '''PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "UPDATE mesin SET tipe = 'sparepart', area = null WHERE tipe = 'keduanya';" '''
stdin, stdout, stderr = ssh.exec_command(cmd_update)
print(stdout.read().decode('utf-8', errors='ignore'))
print(stderr.read().decode('utf-8', errors='ignore'))

# 2. Dump live SQL from VPS
print("Dumping SQL from VPS...")
cmd_dump = '''PGPASSWORD=Admin123 pg_dump -h 127.0.0.1 -p 5433 -U admin -d mtc_db --clean --if-exists'''
stdin, stdout, stderr = ssh.exec_command(cmd_dump)
sql_data = stdout.read().decode('utf-8', errors='ignore')

with open('vps_mtc_dump.sql', 'w', encoding='utf-8') as f:
    f.write(sql_data)

print(f"Dumped {len(sql_data)} bytes to vps_mtc_dump.sql")

ssh.close()
