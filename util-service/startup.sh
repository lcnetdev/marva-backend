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
    nodemon server.js --ignore '*.json'
else
	echo "Doing prod mode"
    forever server.js
fi
