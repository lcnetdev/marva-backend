#!/bin/sh

cd /tmp

if [ -d "production-quartz" ] 
then
    echo "pulllllin"
    cd production-quartz
	cd marva-quartz
	git pull
	# git checkout src/assets/main.css
	# git checkout vue.config.js
	# node /app/deploy-helper.js --action="deploy_marva_prod"	
	npm install
	npm run build
else

	mkdir production-quartz
	cd production-quartz	
	git clone https://github.com/lcnetdev/marva-quartz.git
	cd marva-quartz
	# node /app/deploy-helper.js --action="deploy_marva_prod"
	npm install
	npm run build    

fi

FILE=/tmp/production-quartz/marva-quartz/dist/index.html
if test -f "$FILE"; then
    echo "$FILE exists."
	rm -fr /dist/prod-quartz/*
	cp -R /tmp/production-quartz/marva-quartz/dist/* /dist/prod-quartz/

fi









