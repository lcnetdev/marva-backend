#!/bin/sh

# npm install -g nodemon
npm install
npm install --save cors fast-xml-parser strnum
forever server.js
# nodemon server.js --ignore '*.json' --ignore '*.xml' --ignore /app/tmp/ --ignore app/tmp/ --ignore tmp/