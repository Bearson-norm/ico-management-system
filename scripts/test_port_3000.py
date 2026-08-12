import sys
import paramiko
import json

sys.stdout.reconfigure(encoding='utf-8')

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

cmd = "curl -s 'http://127.0.0.1:3000/api/mtc/stock?search=284'"
_, stdout, _ = ssh.exec_command(cmd)
res_raw = stdout.read().decode('utf-8', errors='ignore')

print("=== API RESPONSE FOR MTC-SP-284 PORT 3000 ===")
print(res_raw)

ssh.close()
