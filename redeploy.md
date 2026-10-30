cd ~/abyssal-reckoning

# 1. Rebuild the tarball and run install.sh directly into your web server's final folder

./build.sh

cd ~/abyssal-reckoning

# 1. Rebuild website.tar.gz from the latest src/ files

tar -czf website.tar.gz -C src .

# 2. Find where partOne is hosted, and install the latest code into /final right beside it

PART_ONE_DIR=$(find / -type d -name "partOne" 2>/dev/null | head -n 1)
if [ -n "$PART_ONE_DIR" ]; then
WEB_ROOT=$(dirname "$PART_ONE_DIR")
./install.sh "$WEB_ROOT/final"
echo "✅ Successfully deployed latest changes to: $WEB_ROOT/final"
else
echo "⚠️ Could not auto-locate partOne. Installing to ./test_deploy"
./install.sh ./test_deploy
fi

# 3. Make sure the background web server is running on port 14980

if ! ss -tulpn | grep -q ":14980 "; then
nohup python3 -m http.server 14980 --directory "$(dirname "$PART_ONE_DIR")" > ~/server_14980.log 2>&1 &
echo "Restarted HTTP server on port 14980."
fi
