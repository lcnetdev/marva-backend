#!/bin/sh

cd /tmp

if [ -d "production-quartz" ] 
then
    echo "pulllllin"
    cd production-quartz
	cd marva-quartz
	git pull
	if [ "$BFORGMODE" = "1" ]; then
		sed -i "s|base: '/bfe2/quartz/'|base: '/marva/'|" vite.config.js
	fi
	npm install
	npm run build
else
	mkdir production-quartz
	cd production-quartz	
	git clone https://github.com/lcnetdev/marva-quartz.git
	cd marva-quartz
	if [ "$BFORGMODE" = "1" ]; then
		sed -i "s|base: '/bfe2/quartz/'|base: '/marva/'|" vite.config.js
	fi
	npm install
	npm run build

fi

FILE=/tmp/production-quartz/marva-quartz/dist/index.html
if test -f "$FILE"; then
    echo "$FILE exists."
	rm -fr /dist/prod-quartz/*
	cp -R /tmp/production-quartz/marva-quartz/dist/* /dist/prod-quartz/

fi









