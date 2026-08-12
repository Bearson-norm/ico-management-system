import sys
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.31.39.189', username='foom', password='FoomIOT2025!', timeout=60)

stdin, stdout, stderr = ssh.exec_command('crontab -l')
out = stdout.read().decode('utf-8', errors='ignore')
print("CRONTAB ON VPS:\n", out)
ssh.close()
