import os
for key in sorted(os.environ.keys()):
    if 'git' in key.lower() or 'token' in key.lower() or 'auth' in key.lower() or 'pass' in key.lower() or 'secret' in key.lower() or 'key' in key.lower():
        print(f"{key}: [present]")
    else:
        print(key)
