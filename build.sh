#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cp -R "$ROOT/src/." "$ROOT/test_deploy/"
cd "$ROOT/src"
tar -czf "$ROOT/website.tar.gz" .
echo "Built $ROOT/website.tar.gz"
