import urllib.request
import zipfile
import io
import os

url = "https://api.github.com/repos/Bearson-norm/ico-management-system/actions/runs/27458021789/logs"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as response:
        zip_data = response.read()
        print("Downloaded zip logs successfully.")
        
        with zipfile.ZipFile(io.BytesIO(zip_data)) as z:
            for name in z.namelist():
                if "Deploy via SSH" in name or "ssh-deploy" in name or name.endswith(".txt"):
                    print(f"Log File: {name}")
                    content = z.read(name).decode('utf-8', errors='ignore')
                    # Print last 50 lines of log
                    lines = content.splitlines()
                    print("\n".join(lines[-50:]))
                    print("-" * 50)
except Exception as e:
    print(f"Error: {e}")
