#!/usr/bin/env bash
#
# JARVIS — deployment script.
# Run this ON YOUR SERVER (the one jarvis-app.org points to), as root or via sudo.
#
#   sudo bash deploy.sh
#
# What it does:
#   1. Downloads the project ZIP from GitHub
#   2. Unpacks it into /var/www/jarvis
#   3. Installs and configures nginx
#   4. Issues a Let's Encrypt SSL certificate for jarvis-app.org + www.jarvis-app.org
#
# Requirements:
#   - Ubuntu/Debian server with public IP
#   - DNS A/AAAA records for jarvis-app.org AND www.jarvis-app.org pointing to THIS server
#   - Ports 80 and 443 open in the firewall

set -euo pipefail

# ----- Config (override via env vars if needed) -------------------------------
REPO_ZIP="${REPO_ZIP:-https://github.com/jamkabhazan-rgb/jarvis/archive/refs/heads/main.zip}"
WEBROOT="${WEBROOT:-/var/www/jarvis}"
DOMAIN="${DOMAIN:-jarvis-app.org}"
WWW_DOMAIN="${WWW_DOMAIN:-www.jarvis-app.org}"
LE_EMAIL="${LE_EMAIL:-jamkabhazan@gmail.com}"
# ------------------------------------------------------------------------------

log() { echo -e "\n\033[1;36m==> $*\033[0m"; }

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root:  sudo bash $0" >&2
  exit 1
fi

log "Installing prerequisites (nginx, certbot, unzip, curl)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx certbot python3-certbot-nginx unzip curl

log "Downloading project ZIP from GitHub"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT
curl -fSL "${REPO_ZIP}" -o "${TMP_DIR}/jarvis.zip"

log "Unpacking into ${WEBROOT}"
unzip -q "${TMP_DIR}/jarvis.zip" -d "${TMP_DIR}/extracted"
# GitHub zips contain a single top-level folder like "jarvis-main"
SRC_DIR="$(find "${TMP_DIR}/extracted" -mindepth 1 -maxdepth 1 -type d | head -n1)"
mkdir -p "${WEBROOT}"
# Sync contents (clean stale files but keep the dir itself)
rm -rf "${WEBROOT:?}/"*
cp -a "${SRC_DIR}/." "${WEBROOT}/"
chown -R www-data:www-data "${WEBROOT}"
find "${WEBROOT}" -type d -exec chmod 755 {} \;
find "${WEBROOT}" -type f -exec chmod 644 {} \;

log "Installing nginx site config"
NGINX_CONF="/etc/nginx/sites-available/jarvis.conf"
# Use the bundled config if present next to this script, else generate one.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/nginx-jarvis.conf" ]]; then
  sed -e "s#__WEBROOT__#${WEBROOT}#g" \
      -e "s#__DOMAIN__#${DOMAIN}#g" \
      -e "s#__WWW_DOMAIN__#${WWW_DOMAIN}#g" \
      "${SCRIPT_DIR}/nginx-jarvis.conf" > "${NGINX_CONF}"
else
  cat > "${NGINX_CONF}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} ${WWW_DOMAIN};
    root ${WEBROOT};
    index JARVIS.html index.html;

    location / {
        try_files \$uri \$uri/ =404;
    }
}
EOF
fi

ln -sf "${NGINX_CONF}" /etc/nginx/sites-enabled/jarvis.conf
rm -f /etc/nginx/sites-enabled/default

log "Testing and reloading nginx"
nginx -t
systemctl enable nginx
systemctl restart nginx

log "Issuing Let's Encrypt certificate for ${DOMAIN} and ${WWW_DOMAIN}"
echo "  (DNS for both names must already point to this server, ports 80/443 open)"
certbot --nginx \
  -d "${DOMAIN}" -d "${WWW_DOMAIN}" \
  --non-interactive --agree-tos --redirect \
  -m "${LE_EMAIL}"

log "Done. https://${DOMAIN} is live."
echo "Certbot installed a systemd timer for auto-renewal. Verify with:"
echo "  systemctl list-timers | grep certbot"
echo "  certbot renew --dry-run"
