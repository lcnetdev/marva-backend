#!/bin/sh

cd /tmp

if [ -d "staging-deploy" ] 
then
    echo "pulllllin"
    cd staging-deploy
	cd bfe2test
	git pull
	npm install
	npm run build
else

	mkdir staging-deploy
	cd staging-deploy	
	git clone https://github.com/thisismattmiller/bfe2test.git
	cd bfe2test
	npm install
	npm run build    

fi

FILE=/tmp/staging-deploy/bfe2test/dist/index.html
if test -f "$FILE"; then
    echo "$FILE exists."
	rm -fr /dist/staging/*
	cp -R /tmp/staging-deploy/bfe2test/dist/* /dist/staging/

fi









