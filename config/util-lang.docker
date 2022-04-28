FROM node:14.16.0-alpine3.12


RUN apk update && apk add g++ make py3-pip supervisor ruby
RUN npm install -g forever nodemon

RUN gem install chinese_pinyin

COPY ../util-lang/lib/python/ArabicTransliterator ArabicTransliterator

RUN cd ArabicTransliterator && python3 setup.py install && pip3 install -e . 

RUN cd ..

COPY ../util-lang/lib/python/cyrillic cyrillic

RUN cd cyrillic && python3 setup.py install && cd .. 

RUN pip3 install flask

COPY ../util-lang/service_script.conf .

WORKDIR /app

CMD ["supervisord","-c","service_script.conf"]

