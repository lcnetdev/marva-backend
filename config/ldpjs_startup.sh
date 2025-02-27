#!/bin/sh

# npm install -g nodemon
echo "Starting up LDPJS"
npm cache clean --force
# npm install --save cors fast-xml-parser strnum
npm install --save cors fast-xml-parser@3.18.0 strnum vary

npm install 
forever server.js
# nodemon server.js --ignore '*.json' --ignore '*.xml' --ignore /app/tmp/ --ignore app/tmp/ --ignore tmp/