import paramiko

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=60)

print("Triggering Odoo sync on VPS...")
stdin, stdout, stderr = ssh.exec_command('curl -s -X POST http://127.0.0.1:1325/api/mtc/odoo/sync -H "Content-Type: application/json" -d \'{"odooOnly": true}\'')
out = stdout.read().decode('utf-8')
print("Sync Response:", out[:300])

print("\nVerifying PR04699 items after sync:")
stdin, stdout, stderr = ssh.exec_command('node /tmp/check_pr.js')
out_db = stdout.read().decode('utf-8')
print(out_db)

ssh.close()
