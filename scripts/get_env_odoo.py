import paramiko

hostname = "103.31.39.189"
username = "foom"
password = "FoomIOT2025!"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname=hostname, username=username, password=password, timeout=30)

stdin, stdout, stderr = ssh.exec_command('grep ODOO /var/www/ico-management-system/.env')
out = stdout.read().decode('utf-8', errors='ignore')
print(out)
ssh.close()
