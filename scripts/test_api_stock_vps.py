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

print("=== CHECK API /api/mtc/stock OUTPUT ON VPS ===")

# Curl the localhost API endpoint from VPS
cmd = "curl -s http://127.0.0.1:3000/api/mtc/stock"
_, stdout, _ = ssh.exec_command(cmd)
res_raw = stdout.read().decode('utf-8', errors='ignore')

try:
    data = json.loads(res_raw)
    if data.get('success'):
        items = data['data']
        print(f"Total spareparts returned by API: {len(items)}")
        print("\nSample items from /api/mtc/stock:")
        for it in items[:10]:
            print(f"  {it['id']} | {it['nama']} | totalIn={it.get('totalIn')} | totalOut={it.get('totalOut')} | currentStock={it.get('currentStock')}")
    else:
        print("API error response:", data)
except Exception as e:
    print("Could not parse JSON:", res_raw[:500])

ssh.close()
