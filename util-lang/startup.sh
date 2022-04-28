#!/bin/sh


npm install
cp lib/js/hangul.js node_modules/
nodemon server.js --ignore '*.json' --ignore /app/tmp/ --ignore app/tmp/ --ignore tmp/
