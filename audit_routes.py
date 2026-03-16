import ast
import re
import sys
import subprocess
import glob

def get_routes_from_file(filepath):
    routes = set()
    with open(filepath, "r") as f:
        content = f.read()

    prefix = ""
    prefix_match = re.search(r'APIRouter\(prefix=[\'"]([^\'"]+)[\'"]', content)
    if prefix_match:
        prefix = prefix_match.group(1)

    # Simple regex to find @app.get("/path") or @router.post("/path")
    pattern = re.compile(r'@(app|router)\.(get|post|put|delete|patch|options)\([\'"]([^\'"]*)[\'"]')
    for match in pattern.finditer(content):
        method = match.group(2).lower()
        path = match.group(3)
        if prefix and not path.startswith(prefix):
            full_path = f"{prefix}{path}"
        else:
            full_path = path

        # normalize trailing slashes unless it's just "/"
        if full_path != "/" and full_path.endswith("/"):
            full_path = full_path[:-1]

        routes.add((method, full_path, filepath))
    return set((m, p) for m, p, f in routes)  # Return just (method, path) pairs

# 1. Get old web.py from git
print("Fetching old web.py...")
old_code = subprocess.check_output(["git", "show", "dc9e167f8480047a61e74942a15a812262115df2^:app/web.py"]).decode("utf-8")
with open("/tmp/old_web.py", "w") as f:
    f.write(old_code)

old_routes = get_routes_from_file("/tmp/old_web.py")
old_api_routes = { (m, p) for m, p in old_routes if p.startswith("/api/") }
print(f"Found {len(old_api_routes)} /api/ routes in old web.py")

# 2. Get new routes from app/api/routers/*.py
new_routes = set()
for filepath in glob.glob("app/api/routers/*.py"):
    if "__" in filepath: continue
    rts = get_routes_from_file(filepath)
    new_routes.update(rts)

print(f"Found {len(new_routes)} routes in new routers")

missing = old_api_routes - new_routes
added = new_routes - old_api_routes

print("\n--- MISSING IN NEW (Were in old web.py but not in new routers) ---")
for m, p in sorted(missing):
    print(f"{m.upper()} {p}")

print("\n--- ADDED IN NEW (Are in new routers but weren't in old web.py) ---")
for m, p in sorted(added):
    print(f"{m.upper()} {p}")
