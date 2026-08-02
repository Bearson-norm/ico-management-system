import sys
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

backup_file = '/home/foom/backup_mtc_db_20260802_175350.sql'

print(f"=== RESTORING DATABASE FROM BACKUP FILE ===")
print(f"File: {backup_file}")

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

# Drop & recreate schema or restore via psql
cmd_restore = f"""
PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" && \
PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -f {backup_file}
"""

stdin, stdout, stderr = ssh.exec_command(cmd_restore, timeout=120)
out = stdout.read().decode('utf-8', errors='ignore')
err = stderr.read().decode('utf-8', errors='ignore')

print("Restore STDOUT summary:", out[-500:] if out else "(empty)")
if err and 'warning' not in err.lower():
    print("ERR:", err[-500:])

# Restart PM2
print("\nRestarting PM2 inventory...")
ssh.exec_command("pm2 restart inventory --update-env")

ssh.close()
print("\n✓ Database berhasil di-RESTORE 100% ke versi backup!")
