#!/usr/bin/env bash
# Opt-in git hook installer. Run once after cloning:
#   bash scripts/install-git-hooks.sh
# Adds a pre-push hook that runs `pnpm test && pnpm run build` so the
# repo's CI guarantees (which used to live in GitHub Actions before we
# disabled them for billing reasons) are enforced locally before any
# push reaches main.
#
# Nothing here is committed to the repo because .git/hooks is local.
# Re-run the script after fresh clones or branch switches if needed.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK_DIR="$ROOT/.git/hooks"
HOOK="$HOOK_DIR/pre-push"

if [ ! -d "$HOOK_DIR" ]; then
  echo "✗ .git/hooks not found — run this from inside a git checkout."
  exit 1
fi

cat > "$HOOK" <<'HOOK_EOF'
#!/usr/bin/env bash
# Auto-installed by scripts/install-git-hooks.sh. Re-run that to refresh.
set -e
echo "→ Running pnpm test before push…"
pnpm test
echo "→ Running pnpm run build before push…"
pnpm run build > /dev/null
echo "✓ pre-push checks passed"
HOOK_EOF

chmod +x "$HOOK"
echo "✓ pre-push hook installed at $HOOK"
echo "  It will run \`pnpm test && pnpm run build\` before every git push."
echo "  Bypass with --no-verify if you really need to skip it."
