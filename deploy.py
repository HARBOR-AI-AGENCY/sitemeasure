#!/usr/bin/env python3
"""
Deploy SiteMeasure to Hostinger VPS at measure.harborai.ca
"""
import paramiko
import tarfile
import io
import os
import sys

HOST = '187.124.228.186'
USER = 'root'
PASS = 'Harbour2026@'
APP_DIR = '/var/www/sitemeasure'
APP_NAME = 'sitemeasure'
PORT_NUM = 3030

# Files/dirs to exclude from the archive
EXCLUDE = {'node_modules', '.git', 'sitemeasure.db', 'sitemeasure.db-shm',
           'sitemeasure.db-wal', 'deploy.py', '__pycache__'}

def make_tarball():
    """Create an in-memory tar of the project (excluding node_modules etc.)"""
    buf = io.BytesIO()
    base = os.path.dirname(os.path.abspath(__file__))
    with tarfile.open(fileobj=buf, mode='w:gz') as tar:
        for root, dirs, files in os.walk(base):
            # Prune excluded dirs in-place
            dirs[:] = [d for d in dirs if d not in EXCLUDE]
            for fname in files:
                if fname in EXCLUDE:
                    continue
                full = os.path.join(root, fname)
                arcname = os.path.relpath(full, base)
                tar.add(full, arcname=arcname)
    buf.seek(0)
    print(f"  Archive size: {buf.getbuffer().nbytes / 1024:.1f} KB")
    return buf

def run(ssh, cmd, show=True):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    if show and out:
        print(f"    {out}")
    if show and err:
        print(f"    ERR: {err}")
    return out, err

def main():
    print(f"\n=== SiteMeasure Deployment -> {HOST} ===\n")

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"[1] Connecting to {HOST}...")
    ssh.connect(HOST, username=USER, password=PASS, timeout=15)
    print("    Connected.")

    # Check node/npm/pm2
    print("[2] Checking server environment...")
    out, _ = run(ssh, "node --version 2>/dev/null && echo ok || echo missing")
    if 'missing' in out:
        print("    Installing Node.js 20...")
        run(ssh, "curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs")
    out, _ = run(ssh, "pm2 --version 2>/dev/null || echo missing")
    if 'missing' in out:
        print("    Installing PM2...")
        run(ssh, "npm install -g pm2")

    # Upload tarball
    print("[3] Uploading project files...")
    tarball = make_tarball()
    sftp = ssh.open_sftp()
    sftp.putfo(tarball, '/tmp/sitemeasure.tar.gz')
    sftp.close()
    print("    Upload complete.")

    # Extract and install
    print("[4] Extracting and installing...")
    run(ssh, f"mkdir -p {APP_DIR}")
    run(ssh, f"tar -xzf /tmp/sitemeasure.tar.gz -C {APP_DIR}")
    run(ssh, f"cd {APP_DIR} && npm install --omit=dev 2>&1 | tail -5")
    run(ssh, "rm /tmp/sitemeasure.tar.gz")
    print("    npm install complete.")

    # PM2
    print("[5] Setting up PM2...")
    run(ssh, f"pm2 delete {APP_NAME} 2>/dev/null || true")
    run(ssh, f"cd {APP_DIR} && pm2 start server.js --name {APP_NAME} -- --port {PORT_NUM}")
    run(ssh, "pm2 save")
    run(ssh, "pm2 startup systemd -u root --hp /root 2>/dev/null | tail -1")
    out, _ = run(ssh, f"pm2 status {APP_NAME}")
    print("    PM2 status shown above.")

    # Nginx
    print("[6] Configuring nginx...")
    nginx_conf = f"""server {{
    listen 80;
    server_name measure.harborai.ca;

    location / {{
        proxy_pass http://localhost:{PORT_NUM};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 10m;
    }}
}}"""
    run(ssh, f"echo '{nginx_conf}' > /etc/nginx/sites-available/sitemeasure")
    run(ssh, "ln -sf /etc/nginx/sites-available/sitemeasure /etc/nginx/sites-enabled/sitemeasure 2>/dev/null || true")
    run(ssh, "nginx -t 2>&1")
    run(ssh, "systemctl reload nginx")
    print("    Nginx configured.")

    # SSL with certbot
    print("[7] Obtaining SSL certificate...")
    out, err = run(ssh, "which certbot || apt-get install -y certbot python3-certbot-nginx 2>/dev/null | tail -2")
    out, err = run(ssh, f"certbot --nginx -d measure.harborai.ca --non-interactive --agree-tos -m keith@harborai.ca --redirect 2>&1")
    if 'Successfully' in out or 'Certificate' in out:
        print("    SSL certificate obtained!")
    elif 'already' in out.lower():
        print("    SSL certificate already exists.")
    else:
        print(f"    SSL note: {out[:200]}")

    print("\n=== Deployment complete ===")
    print(f"  App: https://measure.harborai.ca")
    print(f"  PM2: pm2 status {APP_NAME}")
    print(f"  Logs: pm2 logs {APP_NAME}")

    ssh.close()

if __name__ == '__main__':
    main()
