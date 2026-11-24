#!/usr/bin/env bash
# Publishes every package whose version is not on npm yet (pixi-silk, @pixi-silk/compiler), from an
# up-to-date main, with an npm token typed at a hidden prompt. The token stays in this process: the
# temporary npmrc only holds a ${NPM_TOKEN} reference, and it is deleted on exit. Then it pushes the
# release tags. Usage: pnpm publish:npm
set -euo pipefail
cd "$(dirname "$0")/.."

branch=$(git branch --show-current)
if [ "$branch" != main ]; then
    echo "publish: run this on main (you are on $branch)" >&2
    exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
    echo "publish: the working tree has changes, commit or stash them first" >&2
    exit 1
fi
git fetch -q origin main
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
    echo "publish: main is not origin/main, run git pull first" >&2
    exit 1
fi

read -rsp "npm token (hidden): " NPM_TOKEN
echo
if [ -z "$NPM_TOKEN" ]; then
    echo "publish: no token given" >&2
    exit 1
fi
export NPM_TOKEN
npmrc=$(mktemp)
trap 'rm -f "$npmrc"' EXIT
# npm and pnpm expand ${NPM_TOKEN} from the environment, so the token itself is never written
printf '//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n' >"$npmrc"
export NPM_CONFIG_USERCONFIG="$npmrc" npm_config_userconfig="$npmrc"

echo "publish: npm user $(npm whoami)"
for dir in packages/pixi-silk packages/compiler; do
    name=$(node -p "require('./$dir/package.json').name")
    version=$(node -p "require('./$dir/package.json').version")
    if npm view "$name@$version" version >/dev/null 2>&1; then
        echo "publish: $name@$version is already on npm, skipped"
    else
        echo "publish: $name@$version will be published"
    fi
done
read -rp "Continue? [y/N] " answer
[ "$answer" = y ] || [ "$answer" = Y ] || exit 1

pnpm install --frozen-lockfile
pnpm release

# changeset publish tags each published package, e.g. pixi-silk@1.3.0
git -c credential.helper= -c credential.helper='!gh auth git-credential' \
    push https://github.com/schmooky/pixi-silk.git --tags
echo "publish: done"
