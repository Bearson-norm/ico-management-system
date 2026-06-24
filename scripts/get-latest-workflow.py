import urllib.request
import json

url = "https://api.github.com/repos/Bearson-norm/ico-management-system/actions/runs?per_page=5"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        print("Latest runs:")
        for run in data.get("workflow_runs", []):
            print(f"ID: {run['id']}, Event: {run['event']}, Status: {run['status']}, Conclusion: {run['conclusion']}, Commit: {run['head_commit']['message']}")
except Exception as e:
    print(f"Error: {e}")
