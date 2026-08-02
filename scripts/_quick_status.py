import sys, paramiko
sys.stdout.reconfigure(encoding='utf-8')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.31.39.189', username='foom', password='FoomIOT2025!', timeout=10)
_, out, _ = ssh.exec_command("pm2 status inventory")
print(out.read().decode('utf-8', errors='ignore'))
ssh.close()
