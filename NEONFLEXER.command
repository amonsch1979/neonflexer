#!/bin/bash
# MAGICTOOLBOX NEONFLEXER - Mac/Linux launcher
# Double-click this file to start the app
#
# If macOS blocks this file:
#   Right-click → Open → Open, OR run in Terminal:
#   chmod +x NEONFLEXER.command && ./NEONFLEXER.command

echo "============================================"
echo "  MAGICTOOLBOX NEONFLEXER"
echo "  Starting local server..."
echo "============================================"
echo ""

cd "$(dirname "$0")"

# Function: open browser after server has time to start
open_browser() {
    sleep 1
    if command -v open &>/dev/null; then
        open "$1"
    elif command -v xdg-open &>/dev/null; then
        xdg-open "$1"
    fi
}

# Try Python 3
if command -v python3 &>/dev/null; then
    echo "Found Python3 - starting server on http://localhost:8000"
    echo "Press Ctrl+C to stop."
    echo ""
    open_browser "http://localhost:8000" &
    python3 -m http.server 8000
    exit 0
fi

# Try Python 2
if command -v python &>/dev/null; then
    echo "Found Python - starting server on http://localhost:8000"
    echo "Press Ctrl+C to stop."
    echo ""
    open_browser "http://localhost:8000" &
    python -m http.server 8000 2>/dev/null || python -m SimpleHTTPServer 8000
    exit 0
fi

# Try npx serve
if command -v npx &>/dev/null; then
    echo "Found Node.js - starting server on http://localhost:3000"
    echo "Press Ctrl+C to stop."
    echo ""
    open_browser "http://localhost:3000" &
    npx serve -l 3000 .
    exit 0
fi

echo ""
echo "ERROR: No Python or Node.js found!"
echo ""
echo "Install one of:"
echo "  Python:  https://python.org"
echo "  Node.js: https://nodejs.org"
echo ""
read -p "Press Enter to close..."
