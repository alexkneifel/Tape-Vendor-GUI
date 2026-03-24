#!/bin/bash

# Export display so Chromium knows where to render
export DISPLAY=:0 

# Navigate to the project directory
cd /home/alex/Desktop/Tape-Vendor-GUI/backend

# Run the app and log EVERYTHING to a file on the desktop
python3 app.py > /home/alex/Desktop/kiosk_boot.log 2>&1