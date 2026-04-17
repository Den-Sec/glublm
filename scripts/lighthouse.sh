#!/usr/bin/env bash
# lighthouse.sh - run a Lighthouse audit against a live URL and print the
# top-level scores. Outputs HTML + JSON reports under ./reports/lighthouse/
#
# Usage:
#   ./scripts/lighthouse.sh [URL] [OUTDIR]
#
# Defaults: URL=https://den-sec.github.io/glublm/, OUTDIR=./reports/lighthouse
#
# Requires Node.js. The first run of `npx --yes lighthouse` downloads ~100 MB
# of Lighthouse + its Chrome bundle (cached for subsequent runs).

set -euo pipefail

URL="${1:-https://den-sec.github.io/glublm/}"
OUTDIR="${2:-./reports/lighthouse}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
NAME=$(echo "$URL" | sed 's#https*://##;s#/#_#g' | tr -dc 'a-zA-Z0-9_.-')

mkdir -p "$OUTDIR"
OUT_BASE="${OUTDIR}/${NAME}_${TIMESTAMP}"

echo "running Lighthouse audit against: $URL"
echo "reports: ${OUT_BASE}.report.html + .report.json"
echo

npx --yes lighthouse "$URL" \
  --preset=desktop \
  --output=html,json \
  --output-path="${OUT_BASE}" \
  --chrome-flags="--headless=new --no-sandbox" \
  --quiet

# Extract key scores for quick console feedback.
node -e "
const r = require('${OUT_BASE}.report.json');
const c = r.categories || {};
console.log('--- scores (0-100) ---');
for (const k of ['performance','accessibility','best-practices','seo','pwa']) {
  const v = c[k];
  if (v && typeof v.score === 'number') {
    const n = Math.round(v.score * 100);
    const tag = n >= 90 ? 'OK ' : (n >= 70 ? '~  ' : 'LOW');
    console.log(' ', tag, k.padEnd(18), n);
  }
}
" 2>/dev/null || echo "(score extraction failed - open the HTML report manually)"

echo
echo "full report: ${OUT_BASE}.report.html"
