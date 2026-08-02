import sys
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

# Apply the migration SQL directly to the correct port 5433
print("=== Adding vital column directly to DB ===")
cmd = """PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "ALTER TABLE mesin ADD COLUMN IF NOT EXISTS vital BOOLEAN NOT NULL DEFAULT false;" """
stdin, stdout, stderr = ssh.exec_command(cmd)
out = stdout.read().decode('utf-8', errors='ignore')
err = stderr.read().decode('utf-8', errors='ignore')
print(out or "(no output)")
if err: print("ERR:", err)

# Verify the column is there
print("\n=== Verifying column exists ===")
cmd2 = """PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "SELECT id, nama, tipe, aktif, vital FROM mesin LIMIT 5;" """
stdin2, stdout2, stderr2 = ssh.exec_command(cmd2)
out2 = stdout2.read().decode('utf-8', errors='ignore')
err2 = stderr2.read().decode('utf-8', errors='ignore')
print(out2 or "(kosong)")
if err2: print("ERR:", err2)

# Restart PM2
print("\n=== Restarting PM2 ===")
stdin3, stdout3, stderr3 = ssh.exec_command("pm2 restart inventory --update-env")
out3 = stdout3.read().decode('utf-8', errors='ignore')
print(out3[-500:])

print("\nDone!")
ssh.close()
