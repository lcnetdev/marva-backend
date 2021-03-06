#!/bin/sh

cd /tmp

if [ -d "production-deploy" ] 
then
    echo "pulllllin"
    cd production-deploy
	cd bfe2test
	git pull
	git checkout src/assets/main.css
	git checkout vue.config.js
	node /app/deploy-helper.js --action="deploy_marva_prod"	
	npm install
	npm run build
else

	mkdir production-deploy
	cd production-deploy	
	git clone https://github.com/thisismattmiller/bfe2test.git
	cd bfe2test
	node /app/deploy-helper.js --action="deploy_marva_prod"
	npm install
	npm run build    

fi

FILE=/tmp/production-deploy/bfe2test/dist/index.html
if test -f "$FILE"; then
    echo "$FILE exists."
	rm -fr /dist/prod/*
	cp -R /tmp/production-deploy/bfe2test/dist/* /dist/prod/

fi









