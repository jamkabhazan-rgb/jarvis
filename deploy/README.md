# Deploy JARVIS to a server

These scripts deploy the static JARVIS site to a server behind nginx with a
Let's Encrypt SSL certificate.

> **Important:** run this **on the actual server** that `jarvis-app.org` points
> to. It cannot be run from a CI sandbox or a machine the domain doesn't resolve
> to — Let's Encrypt validates by connecting to the domain over the public
> internet.

## Prerequisites

1. An Ubuntu/Debian server with a public IP.
2. DNS records configured (at your registrar / DNS provider):
   - `jarvis-app.org`      → A record → server IP
   - `www.jarvis-app.org`  → A record → server IP
3. Firewall allows inbound TCP **80** and **443**.

Check DNS has propagated before running:

```bash
dig +short jarvis-app.org
dig +short www.jarvis-app.org
```

Both must return your server's IP.

## Run

```bash
# On the server:
curl -fSL https://raw.githubusercontent.com/jamkabhazan-rgb/jarvis/main/deploy/deploy.sh -o deploy.sh
curl -fSL https://raw.githubusercontent.com/jamkabhazan-rgb/jarvis/main/deploy/nginx-jarvis.conf -o nginx-jarvis.conf
sudo bash deploy.sh
```

Or, if you already cloned the repo on the server:

```bash
sudo bash deploy/deploy.sh
```

The script:
1. Installs nginx, certbot, unzip, curl.
2. Downloads the project ZIP from GitHub and unpacks it into `/var/www/jarvis`.
3. Installs the nginx site config and enables it.
4. Issues a Let's Encrypt cert for `jarvis-app.org` + `www.jarvis-app.org` and
   turns on HTTP→HTTPS redirect.

## Configuration

Override defaults with env vars:

```bash
sudo DOMAIN=jarvis-app.org \
     WWW_DOMAIN=www.jarvis-app.org \
     LE_EMAIL=you@example.com \
     WEBROOT=/var/www/jarvis \
     REPO_ZIP=https://github.com/jamkabhazan-rgb/jarvis/archive/refs/heads/main.zip \
     bash deploy.sh
```

## Updating later

Re-run `sudo bash deploy.sh` — it re-downloads the latest ZIP, refreshes
`/var/www/jarvis`, and reloads nginx. The certificate is reused (certbot
auto-renews via its systemd timer).

## Verify

```bash
curl -I https://jarvis-app.org          # expect HTTP/2 200
systemctl list-timers | grep certbot    # auto-renewal timer present
certbot renew --dry-run                 # renewal works
```
