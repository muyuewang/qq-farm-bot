#!/usr/bin/env bash
set -euo pipefail

cd /app
token_file=/app/napcat-auth/token
mkdir -p "$(dirname "$token_file")"
if [[ ! -s "$token_file" ]]; then
  umask 077
  od -An -N32 -tx1 /dev/urandom | tr -d ' \n' > "$token_file"
fi
NAPCAT_TOKEN=$(tr -d '\r\n' < "$token_file")
export WEBUI_TOKEN="$NAPCAT_TOKEN"

if [[ ! -f /app/napcat/napcat.mjs ]]; then
  unzip -q /app/NapCat.Shell.zip -d /app/NapCat.Shell
  cp -rf /app/NapCat.Shell/* /app/napcat/
  rm -rf /app/NapCat.Shell
fi

rm -rf /app/napcat/plugins/qq-miniapp-openauth
mkdir -p /app/napcat/plugins
cp -a /opt/qq-farm-bot/qq-miniapp-openauth /app/napcat/plugins/

if ! grep -Fq '"qq-miniapp-openauth"' /app/napcat/napcat.mjs; then
  grep -Fq '"napcat-plugin-qce"' /app/napcat/napcat.mjs || {
    echo "NapCat plugin whitelist marker not found; selected image is incompatible" >&2
    exit 1
  }
  sed -i '0,/"napcat-plugin-qce"/s//"napcat-plugin-qce",\n  "qq-miniapp-openauth"/' /app/napcat/napcat.mjs
fi

plugin_config=/app/napcat/config/plugins/qq-miniapp-openauth/config.json
mkdir -p "$(dirname "$plugin_config")"

jq -n --arg token "$NAPCAT_TOKEN" '{token: $token}' > "$plugin_config.tmp"
mv "$plugin_config.tmp" "$plugin_config"
chmod 600 "$plugin_config"

plugins_config=/app/napcat/config/plugins.json
if [[ -s "$plugins_config" ]] && jq empty "$plugins_config" 2>/dev/null; then
  jq '. + {"qq-miniapp-openauth": true}' "$plugins_config" > "$plugins_config.tmp"
else
  jq -n '{"qq-miniapp-openauth": true}' > "$plugins_config.tmp"
fi
mv "$plugins_config.tmp" "$plugins_config"

exec bash /app/entrypoint.sh "$@"
