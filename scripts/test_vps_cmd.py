import paramiko

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

def run_cmd(cmd):
    print(f"\n$ {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='ignore')
    err = stderr.read().decode('utf-8', errors='ignore')
    if out:
        print(out.encode('ascii', errors='backslashreplace').decode('ascii'))
    if err:
        print("ERR:", err.encode('ascii', errors='backslashreplace').decode('ascii'))
    return out

run_cmd("cat /etc/nginx/sites-enabled/* 2>/dev/null || cat /etc/nginx/conf.d/* 2>/dev/null")
run_cmd("ps aux | grep node")
run_cmd("PGPASSWORD=admin123 psql -h 127.0.0.1 -p 5432 -U admin -d mtc_db -c 'SELECT count(*) FROM mesin;' || true")
run_cmd("PGPASSWORD=Admin123 psql -h 127.0.0.1 -p 5433 -U admin -d mtc_db -c 'SELECT count(*) FROM mesin;' || true")

ssh.close()
