import paramiko

hostname = "103.31.39.189"
username = "foom"
password = "FoomIOT2025!"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname=hostname, username=username, password=password, timeout=30)

cmd = '''python3 -c "
with open('/var/www/ico-management-system/.env') as f:
    for line in f:
        if 'DATABASE_URL_MTC' in line or 'DATABASE_URL_GA' in line:
            print(line.strip())
"'''
stdin, stdout, stderr = ssh.exec_command(cmd)
out = stdout.read().decode('utf-8', errors='ignore')
print("DB URLs on VPS:")
print(out)
ssh.close()
