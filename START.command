#!/bin/bash
# MAGICTOOLBOX NEONFLEXER - Mac/Linux launcher
# Double-click this file to start the app

echo "============================================"
echo "  MAGICTOOLBOX NEONFLEXER"
echo "  Starting local server..."
echo "============================================"
echo ""

cd "$(dirname "$0")"

# Try Python 3
if command -v python3 &>/dev/null; then
    echo "Found Python3 - starting server on http://localhost:8000"
    echo "Press Ctrl+C to stop."
    open "http://localhost:8000" 2>/dev/null || xdg-open "http://localhost:8000" 2>/dev/null
    python3 -m http.server 8000
    exit 0
fi

# Try Python 2
if command -v python &>/dev/null; then
    echo "Found Python - starting server on http://localhost:8000"
    echo "Press Ctrl+C to stop."
    open "http://localhost:8000" 2>/dev/null || xdg-open "http://localhost:8000" 2>/dev/null
    python -m http.server 8000 2>/dev/null || python -m SimpleHTTPServer 8000
    exit 0
fi

# Try npx serve
if command -v npx &>/dev/null; then
    echo "Found Node.js - starting server on http://localhost:3000"
    echo "Press Ctrl+C to stop."
    open "http://localhost:3000" 2>/dev/null || xdg-open "http://localhost:3000" 2>/dev/null
    npx serve -l 3000 .
    exit 0
fi

echo ""
echo "ERROR: No Python or Node.js found!"
echo "Install Python from https://python.org or Node from https://nodejs.org"
echo ""
read -p "Press Enter to close..."
