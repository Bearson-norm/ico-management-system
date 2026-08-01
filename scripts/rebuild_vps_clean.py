import paramiko

hostname = "103.31.39.189"
username = "foom"
password = "FoomIOT2025!"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname=hostname, username=username, password=password, timeout=30)

cmd = "cd /var/www/ico-management-system && rm -rf .next && export NODE_OPTIONS='--max-old-space-size=2048' && npm run build && pm2 restart inventory"
stdin, stdout, stderr = ssh.exec_command(f"bash -c '{cmd}'")
out = stdout.read().decode('utf-8', errors='ignore')
err = stderr.read().decode('utf-8', errors='ignore')
print("STDOUT:", out)
if err: print("STDERR:", err)
ssh.close()
