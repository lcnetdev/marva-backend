#!/bin/sh

BRANCH="${1:-main}"

cd /tmp

if [ -d "stage-quartz" ]
then
    echo "pulllllin"
    cd stage-quartz
	cd marva-quartz
	# Check what branch is currently checked out
	CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
	if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
		echo "Switching from $CURRENT_BRANCH to $BRANCH, cleaning directory..."
		git checkout -- .
		git clean -fd
		git fetch origin
		git checkout "$BRANCH"
		git pull origin "$BRANCH"
	else
		git pull
	fi
	if [ "$BFORGMODE" = "1" ]; then
		sed -i "s|base: '/bfe2/quartz/'|base: '/marva/'|" vite.config.js
	fi
	npm install
	npm run build
else

	mkdir stage-quartz
	cd stage-quartz
	git clone https://github.com/lcnetdev/marva-quartz.git
	cd marva-quartz
	if [ "$BRANCH" != "main" ]; then
		git checkout "$BRANCH"
	fi
	if [ "$BFORGMODE" = "1" ]; then
		sed -i "s|base: '/bfe2/quartz/'|base: '/marva/'|" vite.config.js
	fi
	npm install
	npm run build

fi

FILE=/tmp/stage-quartz/marva-quartz/dist/index.html
if test -f "$FILE"; then
    echo "$FILE exists."
	rm -fr /dist/stage-quartz/*
	cp -R /tmp/stage-quartz/marva-quartz/dist/* /dist/stage-quartz/

fi
