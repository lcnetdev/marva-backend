#!/bin/sh

cd /tmp

if [ -d "profile-editor-deploy" ] 
then
    echo "pulllllin"
    cd 'profile-editor-deploy'
	cd 'profile-edit'
	cd 'source'
	git pull
	echo "npm installing"
	npm install
	echo "grunt running"
	grunt
else

	mkdir profile-editor-deploy
	cd 'profile-editor-deploy'
	git clone 'https://github.com/lcnetdev/profile-edit.git'
	cd 'profile-edit'
	cd 'source'
	echo "npm installing"
	npm install
	echo "grunt running"
	grunt    

fi

FILE=/tmp/profile-editor-deploy/profile-edit/source/index.html
if test -f "$FILE"; then
    echo "$FILE exists."

    echo "Copying files"

	rm -fr /dist/profile-editor/*
	cp -R /tmp/profile-editor-deploy/profile-edit/source/* /dist/profile-editor/

	echo "copied over"

    # remove this line from the index.html if it exists so it doesn't break our paths
    sed -e '/<base href="\/profile-edit\/">/d' /dist/profile-editor/index.html > /dist/profile-editor/index.tmp
    mv /dist/profile-editor/index.tmp /dist/profile-editor/index.html

	echo "sed 1 finished"


    # inserting some JS so it labels when it is in the stage or prod region based on the url
    sed -e 's/<\/body>/<script>let x=document.createElement("span"); x.innerText=` -- ${window.location.pathname.includes("-stage") ? "STAGE" : "PROD"} REGION -- `; x.classList.add("normal"); x.style.color=`${window.location.pathname.includes("-stage") ? "#ffeb3b" : "lightgray"}`; document.getElementsByClassName("navbar-header")[0].appendChild(x);<\/script><\/body>/g' /dist/profile-editor/index.html > /dist/profile-editor/index.tmp
    cp /dist/profile-editor/index.tmp /dist/profile-editor/index.test
    mv /dist/profile-editor/index.tmp /dist/profile-editor/index.html

	echo "sed 2 finished"


    # fix the API paths to work with our settings
    node /app/deploy-helper.js --action="deploy_profile_editor"

	echo "deploy-helper finished"


fi









