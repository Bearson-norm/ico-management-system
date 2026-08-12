import sys
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

cmd = "curl -i -s 'http://127.0.0.1:1325/api/mtc/stock?search=284'"
_, stdout, _ = ssh.exec_command(cmd)
print(stdout.read().decode('utf-8', errors='ignore')[:1000])

ssh.close()
