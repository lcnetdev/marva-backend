#!/bin/sh

npm install
echo "----Mode----"
echo "$MODE"
echo "------------"


if [ $MODE = 1 ]
then
	echo "Doing dev mode"
    nodemon server.js --config nodemon.json
else
	echo "Doing prod mode"
    forever server.js
fi
