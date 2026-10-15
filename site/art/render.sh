#!/usr/bin/env bash
# Renders room.svg to the landing page's AVIF/WebP room art, and the logo to a small WebP.
# Needs google-chrome and ffmpeg (with libaom-av1 and libwebp). Run from anywhere.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$here/../public/img"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$out"

cat > "$tmp/room.html" <<EOF
<!doctype html><html><body style="margin:0;overflow:hidden">
<img src="file://$here/room.svg" style="display:block;width:3200px;height:2400px">
</body></html>
EOF
google-chrome --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=3200,2400 --screenshot="$tmp/room.png" "file://$tmp/room.html" >/dev/null 2>&1

for w in 800 1600 2400 3200; do
  h=$((w * 3 / 4))
  ffmpeg -loglevel error -y -i "$tmp/room.png" -vf "scale=$w:$h:flags=lanczos" \
    -c:v libwebp -quality 78 -compression_level 6 "$out/room-$w.webp"
  ffmpeg -loglevel error -y -i "$tmp/room.png" -vf "scale=$w:$h:flags=lanczos,format=yuv420p" \
    -c:v libaom-av1 -still-picture 1 -crf 34 -cpu-used 4 "$out/room-$w.avif"
done

for s in 64 128; do
  ffmpeg -loglevel error -y -i "$here/../public/logo.png" -vf "scale=$s:$s:flags=lanczos" \
    -c:v libwebp -quality 85 "$out/logo-$s.webp"
done
ls -l "$out"
