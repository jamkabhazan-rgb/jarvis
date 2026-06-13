#!/usr/bin/env bash
#
# Deploy J.A.R.V.I.S. static site to /var/www/jarvis, serve via nginx,
# and obtain a Let's Encrypt SSL certificate for jarvis-app.org.
#
# Run on the TARGET SERVER as root:
#   bash deploy.sh
#
# Idempotent: safe to re-run. Re-running re-downloads the latest code
# and refreshes the nginx config (the SSL cert is reused if still valid).

set -euo pipefail

# ---- Config ----------------------------------------------------------------
REPO="jamkabhazan-rgb/jarvis"
BRANCH="claude/epic-galileo-ko32bk"     # repo default branch
DOMAIN="jarvis-app.org"
WWW_DOMAIN="www.jarvis-app.org"
WEBROOT="/var/www/jarvis"
LE_EMAIL="jamkabhazan@gmail.com"        # Let's Encrypt contact email
# ----------------------------------------------------------------------------

log() { echo -e "\n\033[1;32m==>\033[0m $*"; }
err() { echo -e "\n\033[1;31mERROR:\033[0m $*" >&2; }

if [[ "${EUID}" -ne 0 ]]; then
  err "Run this script as root (sudo bash deploy.sh)."
  exit 1
fi

# 1) Install dependencies -----------------------------------------------------
log "Installing nginx, certbot, unzip, curl ..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx unzip curl certbot python3-certbot-nginx

# 2) Download repository ZIP --------------------------------------------------
TMP="$(mktemp -d)"
ZIP="${TMP}/jarvis.zip"
ZIP_URL="https://codeload.github.com/${REPO}/zip/refs/heads/${BRANCH}"

log "Downloading ZIP from ${ZIP_URL} ..."
curl -fsSL "${ZIP_URL}" -o "${ZIP}"

log "Unpacking into ${WEBROOT} ..."
unzip -q -o "${ZIP}" -d "${TMP}"

# GitHub extracts to "<repo>-<branch-with-slashes-as-dashes>"
EXTRACTED="$(find "${TMP}" -maxdepth 1 -type d -name 'jarvis-*' | head -n1)"
if [[ -z "${EXTRACTED}" ]]; then
  err "Could not find extracted directory."
  exit 1
fi

mkdir -p "${WEBROOT}"
# Mirror the repo contents into the webroot (removes stale files on re-run)
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete --exclude='.git' "${EXTRACTED}/" "${WEBROOT}/"
else
  rm -rf "${WEBROOT:?}/"*
  cp -a "${EXTRACTED}/." "${WEBROOT}/"
fi

chown -R www-data:www-data "${WEBROOT}"
find "${WEBROOT}" -type d -exec chmod 755 {} \;
find "${WEBROOT}" -type f -exec chmod 644 {} \;
rm -rf "${TMP}"

# 3) Configure nginx (HTTP first; certbot adds HTTPS) -------------------------
log "Writing nginx site config ..."
cat > /etc/nginx/sites-available/jarvis <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} ${WWW_DOMAIN};

    root ${WEBROOT};
    index index.html JARVIS.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Long cache for static assets
    location ~* \.(?:css|js|svg|png|jpg|jpeg|gif|ico|woff2?)$ {
        expires 7d;
        add_header Cache-Control "public";
    }
}
NGINX

ln -sf /etc/nginx/sites-available/jarvis /etc/nginx/sites-enabled/jarvis
# Disable the default site if present
rm -f /etc/nginx/sites-enabled/default

log "Testing and reloading nginx ..."
nginx -t
systemctl enable nginx
systemctl reload nginx

# 4) Obtain / install Let's Encrypt certificate ------------------------------
log "Requesting Let's Encrypt certificate (HTTP-01 via nginx) ..."
echo "NOTE: ${DOMAIN} and ${WWW_DOMAIN} must point (A/AAAA records) to this server's public IP."
certbot --nginx \
  -d "${DOMAIN}" -d "${WWW_DOMAIN}" \
  --non-interactive --agree-tos -m "${LE_EMAIL}" \
  --redirect

log "Verifying nginx after certbot ..."
nginx -t
systemctl reload nginx

# certbot installs a systemd timer for auto-renewal; verify it
systemctl list-timers 'certbot*' --no-pager || true

log "DONE. Site live at: https://${DOMAIN}  and  https://${WWW_DOMAIN}"
