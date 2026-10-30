#!/bin/bash
set -e
if [ "$#" -ne 1 ]; then
    echo "Usage: ./install.sh folderName"
    exit 1
fi
DEST="$1"
ARCHIVE="website.tar.gz"
if [ ! -f "$ARCHIVE" ]; then
    echo "Error: $ARCHIVE not found."
    exit 1
fi
mkdir -p "$DEST"
tar -xzf "$ARCHIVE" -C "$DEST"
# The archive is a flat static site. Limit permissions to its top-level assets
# so installing into a parent web root does not rewrite unrelated project files.
find "$DEST" -maxdepth 1 -type f -exec chmod 644 {} +
echo "Website successfully installed in: $DEST"
