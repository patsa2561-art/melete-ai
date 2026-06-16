#!/usr/bin/env bash
# Deploy Melete discovery-as-a-service to a droplet — ADDITIVE + REVERSIBLE (never touches other services).
# Melete has ZERO runtime dependencies, so we ship the prebuilt artifact (dist + bin) — no npm/build on the box.
#
#   bash scripts/deploy-melete.sh root@HOST --key=~/.ssh/key [--hostname=melete.HOST.nip.io] [--port=8790]
#   bash scripts/deploy-melete.sh root@HOST --key=~/.ssh/key --down     # tear down (service + caddy block)
#
# Prereqs on the droplet: node ≥18, caddy running with a /etc/caddy/Caddyfile.
set -euo pipefail
H="${1:?usage: deploy-melete.sh root@HOST --key=... [--hostname=...] [--port=...] [--down]}"; shift
KEY=""; PORT=8790; HOSTNAME=""; DOWN=0
for a in "$@"; do case "$a" in
  --key=*) KEY="-i ${a#*=}";;
  --port=*) PORT="${a#*=}";;
  --hostname=*) HOSTNAME="${a#*=}";;
  --down) DOWN=1;;
esac; done
IP="${H#*@}"; HOSTNAME="${HOSTNAME:-melete.$IP.nip.io}"
SSH="ssh $KEY -o StrictHostKeyChecking=no $H"

if [ "$DOWN" = "1" ]; then
  $SSH "systemctl disable --now mneme-melete 2>/dev/null || true; rm -f /etc/systemd/system/mneme-melete.service; systemctl daemon-reload;
    if [ -f /etc/caddy/Caddyfile.bak.melete ]; then cp /etc/caddy/Caddyfile.bak.melete /etc/caddy/Caddyfile && systemctl reload caddy; fi
    echo 'melete torn down (other services untouched)'"
  exit 0
fi

echo "▸ shipping prebuilt artifact to /opt/melete …"
tar czf - dist bin public package.json README.md LICENSE | $SSH "mkdir -p /opt/melete && tar xzf - -C /opt/melete"

echo "▸ systemd unit on 127.0.0.1:$PORT …"
$SSH "cat > /etc/systemd/system/mneme-melete.service <<UNIT
[Unit]
Description=Melete discovery-as-a-service
After=network.target
[Service]
ExecStart=/usr/bin/node /opt/melete/bin/melete-server.mjs
Environment=PORT=$PORT
Environment=HOST=127.0.0.1
Environment=MELETE_MAX_BUDGET=120
Restart=always
User=root
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload && systemctl enable mneme-melete && systemctl restart mneme-melete && sleep 2 && curl -s --max-time 8 http://127.0.0.1:$PORT/health"

echo ""
echo "▸ caddy site (additive) for $HOSTNAME …"
$SSH "if ! grep -q '$HOSTNAME' /etc/caddy/Caddyfile; then
  cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.melete
  printf '\n# --- mneme-melete (additive) ---\n$HOSTNAME {\n\treverse_proxy 127.0.0.1:$PORT\n}\n' >> /etc/caddy/Caddyfile
fi
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile && systemctl reload caddy && echo reloaded"

echo ""
echo "✓ Melete live at: https://$HOSTNAME   (≈30s for the TLS cert on first hit)"
echo "  Teardown: bash scripts/deploy-melete.sh $H --key=... --down"
