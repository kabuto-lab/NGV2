#!/usr/bin/env bash
set -Eeuo pipefail

exec 9>/run/lock/nextgenium-storyblok-deploy.lock
flock -n 9 || { echo 'Another Next Genium deployment is running'; exit 75; }

source_dir=/opt/nextgenium-source
site_dir=/var/www/nextgenium-production
env_file=/etc/nextgenium/storyblok.env

test -r "$env_file" || { echo "Missing $env_file"; exit 1; }
set -a
# This file is managed by the server administrator and contains only KEY=VALUE settings.
source "$env_file"
set +a
: "${STORYBLOK_PUBLIC_TOKEN:?Set STORYBLOK_PUBLIC_TOKEN in storyblok.env}"
export STORYBLOK_PREVIEW_MODE=0

cd "$source_dir"
npm run build

release="$site_dir/releases/$(date -u +%Y%m%dT%H%M%SZ)-storyblok"
mkdir -p "$release"
rsync -a dist/ "$release/"
ln -s "$site_dir/shared/site" "$release/site"
test -s "$release/index.html"
test -s "$release/ru/index.html"
test -s "$release/news/index.html"

previous=$(readlink -f "$site_dir/current")
temporary="$site_dir/.current-next.$$"
ln -s "$release" "$temporary"
mv -Tf "$temporary" "$site_dir/current"

if ! curl --silent --show-error --fail --resolve next-genium.com:443:127.0.0.1 https://next-genium.com/ >/dev/null; then
  ln -s "$previous" "$temporary"
  mv -Tf "$temporary" "$site_dir/current"
  echo 'Health check failed; previous release restored' >&2
  exit 1
fi

echo "Published $release"
