#!/usr/bin/env bash
# Upstream has no licence, so it is fetched at run time and never committed here.
set -euo pipefail

REPO=https://github.com/anthropics/original_performance_takehome
PIN=5452f74bd977807ac2e74f3d29432b9df6f25197

if [ $# -ne 1 ]; then
  echo "usage: fetch.sh <dir>" >&2
  exit 2
fi
dest=$1

mkdir -p "$dest"
git -C "$dest" init -q -b main
git -C "$dest" remote add origin "$REPO"
git -C "$dest" fetch -q --depth 1 origin "$PIN"
# The upstream README checks for test tampering with `git diff origin/main tests/`,
# so origin/main must name the pinned commit rather than whatever upstream is now.
git -C "$dest" update-ref refs/remotes/origin/main "$PIN"
git -C "$dest" checkout -q -B main "$PIN"

head=$(git -C "$dest" rev-parse HEAD)
if [ "$head" != "$PIN" ]; then
  echo "fetch.sh: checked out $head, expected $PIN" >&2
  exit 1
fi
