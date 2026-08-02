import sys
import paramiko
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

ts = datetime.now().strftime('%Y%m%d_%H%M%S')
backup_path = f'/home/foom/backup_mtc_db_{ts}.sql'

print(f"=== BACKUP DATABASE VPS ===")
print(f"Target: {backup_path}")

cmd = f"PGPASSWORD=Admin123 pg_dump -h 127.0.0.1 -p 5433 -U admin -d mtc_db -F p --no-owner --no-acl -f {backup_path}"
stdin, stdout, stderr = ssh.exec_command(cmd, timeout=120)
out = stdout.read().decode('utf-8', errors='ignore')
err = stderr.read().decode('utf-8', errors='ignore')

if err and 'warning' not in err.lower():
    print("ERROR:", err)
else:
    print("Backup selesai tanpa error.")

# Verify backup size
stdin2, stdout2, _ = ssh.exec_command(f"ls -lh {backup_path}")
print(stdout2.read().decode('utf-8', errors='ignore'))

# Quick verify backup is valid SQL
stdin3, stdout3, _ = ssh.exec_command(f"head -5 {backup_path}")
print("\nVerifikasi isi backup:")
print(stdout3.read().decode('utf-8', errors='ignore'))

ssh.close()
print(f"\n✓ Backup berhasil: {backup_path}")
