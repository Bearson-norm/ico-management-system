import sys
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

# Check mesin data directly in DB
cmd = """PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "SELECT id, nama, tipe, aktif, vital FROM mesin LIMIT 20;" """
stdin, stdout, stderr = ssh.exec_command(cmd)
out = stdout.read().decode('utf-8', errors='ignore')
err = stderr.read().decode('utf-8', errors='ignore')
print("=== MESIN DATA ===")
print(out or "(kosong)")
if err: print("ERR:", err)

# Check if vital column exists
cmd2 = """PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "\d mesin" """
stdin2, stdout2, stderr2 = ssh.exec_command(cmd2)
out2 = stdout2.read().decode('utf-8', errors='ignore')
print("\n=== MESIN TABLE SCHEMA ===")
print(out2)

# Check PM2 error logs
cmd3 = "tail -n 30 ~/.pm2/logs/inventory-error.log 2>/dev/null || pm2 logs inventory --lines 20 --nostream 2>/dev/null | tail -30"
stdin3, stdout3, stderr3 = ssh.exec_command(cmd3)
out3 = stdout3.read().decode('utf-8', errors='ignore')
print("\n=== PM2 ERROR LOG ===")
print(out3[-2000:] if out3 else "(kosong)")

ssh.close()
