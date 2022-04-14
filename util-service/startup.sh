#!/bin/sh

npm install
echo "$MODE"
echo "$MODE"
echo "$MODE"
echo "$MODE"
echo "$MODE"
echo "$MODE"
echo "$MODE"
echo "$MODE"
echo "$MODE"
echo $MODE


if [ $MODE = 1 ]
then
	echo "Doing dev mode"
    nodemon server.js --ignore '*.json' --ignore /app/tmp/ --ignore app/tmp/ --ignore tmp/
else
	echo "Doing prod mode"
    forever server.js
fi
