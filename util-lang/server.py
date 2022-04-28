from flask import Flask, jsonify, abort, request, make_response, url_for
import cyrtranslit

import ArabicTransliterator
from ArabicTransliterator import ALA_LC_Transliterator
import mishkal.tashkeel.tashkeel as tashkeel

arabic_transliterator = ALA_LC_Transliterator()


app = Flask(__name__, static_url_path = "")




    
@app.errorhandler(400)
def bad_request(error):
    return make_response(jsonify( { 'error': 'Bad request' } ), 400)

@app.errorhandler(404)
def not_found(error):
    return make_response(jsonify( { 'error': 'Not found' } ), 404)


@app.route('/arabic', methods = ['POST'])
def romanize_arabic():
    arabic_vocalizer=tashkeel.TashkeelClass()
    voc = arabic_vocalizer.tashkeel(request.json['value'].strip())
    # print('********')
    # print(voc)
    # print(request.json['value'])
    # print('********')
    # print(arabic_transliterator.do(voc.strip()))
    # print(arabic_transliterator.do(request.json['value']))
    # print('--------')

    results = arabic_transliterator.do(voc.strip())
    # results = arabic_transliterator.do(request.json['value'].strip())
    return jsonify( { 'value': results } ), 200

@app.route('/cyrillic', methods = ['POST'])
def romanize_cyrillic():



    if request.json['type'] == 'sb':
        return jsonify( { 'value': cyrtranslit.to_latin(request.json['value']) } ), 200
    else:
        return jsonify( { 'value': cyrtranslit.to_latin(request.json['value'], lang_code=request.json['type']) } ), 200






    return jsonify( { 'value': None } ), 404
    





@app.route('/', methods = ['GET'])
def homepage():
    return jsonify( { 'hi': "Helo" } ), 200



#request.json.get('title', task[0]['title'])
    
if __name__ == '__main__':
    app.run(debug = True, port=7777)