#!/bin/sh

cd /tmp

if [ -d "profile-editor-deploy" ] 
then
    echo "pulllllin"
    cd 'profile-editor-deploy'
	cd 'profile-edit'
	cd 'source'
	git pull
	npm install
	grunt
else

	mkdir profile-editor-deploy
	cd 'profile-editor-deploy'
	git clone 'https://github.com/lcnetdev/profile-edit.git'
	cd 'profile-edit'
	cd 'source'
	npm install
	grunt    

fi

FILE=/tmp/profile-editor-deploy/profile-edit/index.html
if test -f "$FILE"; then
    echo "$FILE exists."
	rm -fr /dist/profile-editor/*
	cp -R /tmp/profile-editor-deploy/profile-edit/source/* /dist/profile-editor/

fi









