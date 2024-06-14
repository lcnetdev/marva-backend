#!/bin/sh

cd /tmp

if [ -d "stage-quartz" ] 
then
    echo "pulllllin"
    cd stage-quartz
	cd marva-quartz
	git pull
	# git checkout src/assets/main.css
	# git checkout vue.config.js
	# node /app/deploy-helper.js --action="deploy_marva_prod"	
	npm install
	npm run build
else

	mkdir stage-quartz
	cd stage-quartz	
	git clone https://github.com/lcnetdev/marva-quartz.git
	cd marva-quartz
	# node /app/deploy-helper.js --action="deploy_marva_prod"
	npm install
	npm run build    

fi

FILE=/tmp/stage-quartz/marva-quartz/dist/index.html
if test -f "$FILE"; then
    echo "$FILE exists."
	rm -fr /dist/stage-quartz/*
	cp -R /tmp/stage-quartz/marva-quartz/dist/* /dist/stage-quartz/

fi









