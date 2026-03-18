#!/bin/bash
# Wait for the desktop to fully load
sleep 10 

# Export display so Chromium knows where to render
export DISPLAY=:0 

cd /home/alex/Desktop/Tape-Vendor-GUI/backend
python3 app.py