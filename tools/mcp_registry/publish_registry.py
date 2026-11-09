"""Publish the TV Music Store MCP server to the official MCP Registry.

Run it from VS Code (Run button), no arguments. It:
  1. checks that the site already serves /.well-known/mcp-registry-auth
     (the proof that we own tvmusicstore.com; deploy the site first),
  2. downloads the official mcp-publisher tool for Windows (once),
  3. logs in with our domain key (key.pem, never commit it),
  4. publishes server.json.
Run it again after changing server.json (raise "version" first).
"""
import base64
import io
import os
import subprocess
import sys
import tarfile
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
DOMAIN = "tvmusicstore.com"
AUTH_URL = "https://%s/.well-known/mcp-registry-auth" % DOMAIN
BIN_DIR = os.path.join(HERE, "bin")
RELEASE = "https://github.com/modelcontextprotocol/registry/releases/latest/download/"


def private_key_hex():
    # key.pem is an Ed25519 PKCS8 key: the last 32 bytes of the DER are the private seed
    with open(os.path.join(HERE, "key.pem"), "r", encoding="ascii") as f:
        body = "".join(l.strip() for l in f if l.strip() and not l.startswith("-----"))
    return base64.b64decode(body)[-32:].hex()


def local_proof():
    path = os.path.join(HERE, "..", "..", "public", ".well-known", "mcp-registry-auth")
    with open(path, "r", encoding="ascii") as f:
        return f.read().strip()


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "tvms-registry-publisher"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def publisher_exe():
    exe = os.path.join(BIN_DIR, "mcp-publisher.exe" if os.name == "nt" else "mcp-publisher")
    if os.path.exists(exe):
        return exe
    os.makedirs(BIN_DIR, exist_ok=True)
    if os.name == "nt":
        name = "mcp-publisher_windows_amd64.tar.gz"
    elif sys.platform == "darwin":
        name = "mcp-publisher_darwin_arm64.tar.gz"
    else:
        name = "mcp-publisher_linux_amd64.tar.gz"
    print("Downloading %s ..." % name)
    data = fetch(RELEASE + name)
    if name.endswith(".zip"):
        zipfile.ZipFile(io.BytesIO(data)).extractall(BIN_DIR)
    else:
        tarfile.open(fileobj=io.BytesIO(data), mode="r:gz").extractall(BIN_DIR)
    if not os.path.exists(exe):
        sys.exit("Downloaded, but %s is not inside the archive. Tell Claude." % exe)
    if os.name != "nt":
        os.chmod(exe, 0o755)
    return exe


def run(args):
    print("> mcp-publisher " + " ".join(a if len(a) < 40 else "<key>" for a in args[1:]))
    r = subprocess.run(args, cwd=HERE, capture_output=True, text=True)
    out = (r.stdout + r.stderr).strip()
    print(out)
    return r.returncode == 0


def main():
    print("1. Checking the domain proof on the live site...")
    try:
        live = fetch(AUTH_URL).decode("ascii", "replace").strip()
    except Exception as e:
        sys.exit("Could not open %s (%s). Deploy the site first, then run this again." % (AUTH_URL, e))
    if live != local_proof():
        sys.exit("The site serves a different proof file. Deploy the site first, then run this again.")
    print("   OK")

    print("2. Getting mcp-publisher...")
    exe = publisher_exe()
    print("   OK: " + exe)

    print("3. Logging in as %s..." % DOMAIN)
    if not run([exe, "login", "http", "--domain", DOMAIN, "--private-key", private_key_hex()]):
        sys.exit("Login failed, send the text above to Claude.")

    print("4. Publishing server.json...")
    if not run([exe, "publish"]):
        sys.exit("Publish failed, send the text above to Claude.")
    print("\nDone. Check: https://registry.modelcontextprotocol.io/v0/servers?search=tvmusicstore")


if __name__ == "__main__":
    main()
