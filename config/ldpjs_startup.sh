#!/bin/sh

# npm install -g nodemon
echo "Starting up LDPJS"
npm cache clean --force
npm install --save cors fast-xml-parser strnum
npm install 
forever server.js
# nodemon server.js --ignore '*.json' --ignore '*.xml' --ignore /app/tmp/ --ignore app/tmp/ --ignore tmp/