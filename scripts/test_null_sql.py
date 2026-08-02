import sys
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

print("=== TESTING PRISMA SQL BEHAVIOR FOR NULL purchase_type ===")

# Query 1: standard != 'histori-sheets'
cmd1 = """PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "
SELECT COUNT(*) FROM stock_movement WHERE purchase_type != 'histori-sheets';
" """
_, out1, _ = ssh.exec_command(cmd1)
print("1. Using `!= 'histori-sheets'` count:", out1.read().decode('utf-8').strip())

# Query 2: IS DISTINCT FROM 'histori-sheets'
cmd2 = """PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "
SELECT COUNT(*) FROM stock_movement WHERE purchase_type IS DISTINCT FROM 'histori-sheets';
" """
_, out2, _ = ssh.exec_command(cmd2)
print("2. Using `IS DISTINCT FROM 'histori-sheets'` count:", out2.read().decode('utf-8').strip())

# Query 3: (purchase_type IS NULL OR purchase_type != 'histori-sheets')
cmd3 = """PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c "
SELECT COUNT(*) FROM stock_movement WHERE purchase_type IS NULL OR purchase_type != 'histori-sheets';
" """
_, out3, _ = ssh.exec_command(cmd3)
print("3. Using `IS NULL OR != 'histori-sheets'` count:", out3.read().decode('utf-8').strip())

ssh.close()
