import sys
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

# Check pm2 env / port for inventory
_, out, _ = ssh.exec_command("pm2 env 4 | grep -i port || netstat -tlpn | grep node")
print(out.read().decode('utf-8'))

ssh.close()
