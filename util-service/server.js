const express = require('express');
const shell = require('shelljs')
const cors = require('cors')
// const rp = require('request-promise');
const fs = require('fs');
const zip = require('zip-a-folder');
const simpleGit = require('simple-git')();
const crypto = require('crypto');
const { Marc } = require('marcjs');
const mongo = require('mongodb')
const MongoClient = mongo.MongoClient;

// const session = require('express-session')
// const bodyParser = require('body-parser');
// const yaml = require('js-yaml');
// const axios = require("axios");

var got

(async function () {
	got = await import('got');
	got = got.got
})();


const { promisify } = require('util');
const exec = promisify(require('child_process').exec)

const NodeCache = require( "node-cache" );
const wcMarcCache = new NodeCache();
const cacheTTL = 43200  //12 hours

var recsStageByEid = {}
var recsProdByEid = {}


var recsStageByUser = {}
var recsProdByUser = {}

const MLUSER = process.env.MLUSER;
const MLPASS = process.env.MLPASS;
const MLUSERSTAGE = process.env.MLUSERSTAGE;
const MLPASSSTAGE = process.env.MLPASSSTAGE;
const STAGINGPOSTURL = process.env.STAGINGPOSTURL;
const PRODUCTIONPOSTURL = process.env.PRODUCTIONPOSTURL;
const STAGGINGccURL = process.env.STAGGINGccURL;
const PRODUCTIONccURL = process.env.PRODUCTIONccURL;
const VALIDATIONURL = process.env.VALIDATIONURL;
const STAGINGNACOSTUB = process.env.STAGINGNACOSTUB;
const PRODUCTIONNACOSTUB = process.env.PRODUCTIONNACOSTUB;
const WC_CLIENTID = process.env.WC_CLIENTID;
const WC_SECRET = process.env.WC_SECRET;
const LCAP_SYNC = process.env.LCAP_SYNC;
const RECORD_HISTORY = process.env.RECORD_HISTORY;


// disable some features when running in bibframe.org mode
const BFORGMODE = process.env.BFORGMODE;

let postLog = []

let editorVersion = {'major':0,'minor':0,'patch':0}

try{
	editorVersion = JSON.parse(fs.readFileSync('ver_prod.json', 'utf8'));
}catch{
	console.error("Missing ver_prod.json")
}


let editorVersionStage = {'major':0,'minor':0,'patch':0}

try{
	editorVersionStage = JSON.parse(fs.readFileSync('ver_stage.json', 'utf8'));
}catch{
	console.error("Missing ver_stage.json")
}



// if (process.env.EDITORVERSION){
// 	let v = process.env.EDITORVERSION.split('.')
// 	editorVersion.major = parseInt(v[0])
// 	editorVersion.minor = parseInt(v[1])
// 	editorVersion.patch = parseInt(v[2])
// }


let now = parseInt(new Date() / 1000)
let ageLimitForAllRecords = 15 //days
let NACO_START = 2025700001
let nacoIdObj = null
let marva001Obj = null

let marva001_START = 1260000000

let lastUpdateNames = null
let lastUpdateSubjects = null

const uri = 'mongodb://mongo:27017/';
MongoClient.connect(uri, { useUnifiedTopology: true }, function(err, client) {

	console.log("err", err)
	console.log("client", client)

    const db = client.db('bfe2');


    db.collection('lccnNACO').findOne({}).then(function(doc) {
    	if(!doc){
    		// no doc here means there is no collection, so insert our first number
    		db.collection("lccnNACO").insertOne({ id: NACO_START },
	        	function(err, result) {
	        		console.log("Inserted the first ID")
	        		db.collection('lccnNACO').findOne({}).then(function(doc) {
	        			nacoIdObj = doc
	        		})
	        })
    	}else{
    		nacoIdObj = doc
    	}
    })

	db.collection('marva001').findOne({}).then(function(doc) {
    	if(!doc){
    		// no doc here means there is no collection, so insert our first number
    		db.collection("marva001").insertOne({ id: marva001_START },
	        	function(err, result) {
	        		console.log("Inserted the first ID")
	        		db.collection('marva001').findOne({}).then(function(doc) {
	        			marva001Obj = doc
	        		})
	        })
    	}else{
    		marva001Obj = doc
    	}

		console.log("doc: ", doc)
    })

	// User Preferences
	db.collection('userPrefs').findOne({}).then(function(doc) {
    	if(!doc){
    		// no doc here means there is no collection, so insert our first number
    		db.collection("userPrefs").insertOne({ user: 'test0123456789', prefs: ":)" },
	        	function(err, result) {
	        		console.log("Inserted the first ID")
	        		db.collection('userPrefs').findOne({}).then(function(doc) {
	        			userPref = doc
	        		})
	        })
    	}
    })

    // build an intial index
    // db.collection('resourcesStaging').find({}, {}, 0, 1, function (err, docs) {
    //     if(err){
    //         throw err;
    //     }
    //     console.log(col);
    //     docs.forEach(console.log);
    // });



    var cursor = db.collection('resourcesStaging').find({});

 		cursor.forEach((doc)=>{

 			if (doc.index){

 				if ((now - doc.index.timestamp) / 60 / 60 / 24 <= ageLimitForAllRecords){

		 			// console.log("-------doc")

		 			// console.log(doc)
		 			// console.log('doc.index.eid',doc.index.eid)
		 			// console.log('doc.index.user',doc.index.user)


	 				if (doc.index.eid){
	 					recsStageByEid[doc.index.eid] = doc.index
	 					recsStageByEid[doc.index.eid]._id = doc._id
	 				}
	 				if (doc.index.user && doc.index.eid){
						let userName
						try{
							userName = doc.index.user.replace(/  /g, ' ');
						}catch{
							userName = doc.index.user
						}
	 					if (!recsStageByUser[userName]){
	 						recsStageByUser[userName] = {}
	 					}
	 					recsStageByUser[userName][doc.index.eid] = doc.index
	 					recsStageByUser[userName][doc.index.eid]._id = doc._id
	 				}
	 			}
 			}
 		})


    db.collection('resourcesStaging').watch().on('change', data =>
    {
        // Handle delete operations - remove from in-memory cache
        if (data.operationType === 'delete') {
            const deletedId = data.documentKey['_id'].toString();
            // Find and remove from caches by _id
            for (let eid in recsStageByEid) {
                if (recsStageByEid[eid]._id && recsStageByEid[eid]._id.toString() === deletedId) {
                    const user = recsStageByEid[eid].user;
                    delete recsStageByEid[eid];
                    if (user && recsStageByUser[user]) {
                        delete recsStageByUser[user][eid];
                    }
                    break;
                }
            }
            return;
        }

        // get the doc
				db.collection('resourcesStaging').findOne({'_id':new mongo.ObjectID(data.documentKey['_id'])})
				.then(function(doc) {
        if(!doc) return; // Document may have been deleted, skip silently

			      // add it to the list or update it whatever
		 				if (doc.index.eid){
		 					recsStageByEid[doc.index.eid] = doc.index
		 					recsStageByEid[doc.index.eid]._id = doc._id
		 				}

			      if (doc.index.user && doc.index.eid){
		 					if (!recsStageByUser[doc.index.user]){
		 						recsStageByUser[doc.index.user] = {}
		 					}
		 					recsStageByUser[doc.index.user][doc.index.eid] = doc.index
		 					recsStageByUser[doc.index.user][doc.index.eid]._id = doc._id
			      }




			  });


    });




    var cursor = db.collection('resourcesProduction').find({});

 		cursor.forEach((doc)=>{

 			if (doc.index){

 				if ((now - doc.index.timestamp) / 60 / 60 / 24 <= ageLimitForAllRecords){

	 				if (doc.index.eid){
	 					recsProdByEid[doc.index.eid] = doc.index
	 					recsProdByEid[doc.index.eid]._id = doc._id
	 				}
	 				if (doc.index.user && doc.index.eid){
						let userName
						try{
							userName = doc.index.user.replace(/  /g, ' ');
						}catch{
							userName = doc.index.user
						}
	 					if (!recsProdByUser[userName]){
	 						recsProdByUser[userName] = {}
	 					}
	 					recsProdByUser[userName][doc.index.eid] = doc.index
	 					recsProdByUser[userName][doc.index.eid]._id = doc._id
	 				}
	 			}
 			}
 		})


    db.collection('resourcesProduction').watch().on('change', data =>
    {
        // Handle delete operations - remove from in-memory cache
        if (data.operationType === 'delete') {
            const deletedId = data.documentKey['_id'].toString();
            // Find and remove from caches by _id
            for (let eid in recsProdByEid) {
                if (recsProdByEid[eid]._id && recsProdByEid[eid]._id.toString() === deletedId) {
                    const user = recsProdByEid[eid].user;
                    delete recsProdByEid[eid];
                    if (user && recsProdByUser[user]) {
                        delete recsProdByUser[user][eid];
                    }
                    break;
                }
            }
            return;
        }

        // get the doc
				db.collection('resourcesProduction').findOne({'_id':new mongo.ObjectID(data.documentKey['_id'])})
				.then(function(doc) {
        if(!doc) return; // Document may have been deleted, skip silently

			      // add it to the list or update it whatever
		 				if (doc.index.eid){
		 					recsProdByEid[doc.index.eid] = doc.index
		 					recsProdByEid[doc.index.eid]._id = doc._id
		 				}

			      if (doc.index.user && doc.index.eid){
		 					if (!recsProdByUser[doc.index.user]){
		 						recsProdByUser[doc.index.user] = {}
		 					}
		 					recsProdByUser[doc.index.user][doc.index.eid] = doc.index
		 					recsProdByUser[doc.index.user][doc.index.eid]._id = doc._id
			      }




			  });


    });





});






var app = express();

app.set('view engine', 'ejs');

app.use(express.json({limit: '15mb'}));

app.use(cors({origin:true}))

app.options('*', cors())


// app.get('/', function(request, response){
//   console.log(request.body);      // your JSON
//    response.send(request.body);    // echo the result back
// });

app.get('/', function(request, response) {


	let correctlogin
	if (request.headers.authorization){
		correctlogin = Buffer.from(`${process.env.DEPLOYPW.replace(/"/g,'')}:${process.env.DEPLOYPW.replace(/"/g,'')}`).toString('base64')
	}
	if (  request.headers.authorization !== `Basic ${correctlogin}`){
		return response.set('WWW-Authenticate','Basic').status(401).send('Authentication required.') // Access denied.
	}


	// load the local deploy options
	let config = JSON.parse(fs.readFileSync('util_config.json', 'utf8'));


	// Access granted...
	response.render('index', { editorVersionStage: editorVersionStage, editorVersion:editorVersion, config: config });

});



app.get('/version/editor', function(request, response){
  response.json(editorVersion);
});

app.get('/version/editor/stage', function(request, response){
  response.json(editorVersionStage);
});

app.get('/version/set/:env/:major/:minor/:patch', function(request, response){

	let correctlogin = 'INCORRECTLOGINVALUE'

	if (request.headers.authorization){
		correctlogin = Buffer.from(`${process.env.DEPLOYPW.replace(/"/g,'')}:${process.env.DEPLOYPW.replace(/"/g,'')}`).toString('base64')
	}
	if (  request.headers.authorization !== `Basic ${correctlogin}`){
		return response.set('WWW-Authenticate','Basic').status(401).send('Authentication required.') // Access denied.
	}


	let ver = {"major":parseInt(request.params.major),"minor":parseInt(request.params.minor),"patch":parseInt(request.params.patch)}

	if (request.params.env == 'staging'){
		fs.writeFileSync( 'ver_stage.json' , JSON.stringify(ver))
		editorVersionStage = ver
	}else{
		fs.writeFileSync( 'ver_prod.json' , JSON.stringify(ver))
		editorVersion = ver
	}



	response.json({});
});




app.get('/reports/stats/:year/:quarter', function(request, response){



	let correctlogin = 'INCORRECTLOGINVALUE'
	if (request.headers.authorization){
		correctlogin = Buffer.from(`${process.env.STATSPW.replace(/"/g,'')}:${process.env.STATSPW.replace(/"/g,'')}`).toString('base64')
	}
	if (  request.headers.authorization !== `Basic ${correctlogin}`){
		return response.set('WWW-Authenticate','Basic').status(401).send('Authentication required.') // Access denied.
	}

	var chunk = function(arr, chunkSize) {
	  if (chunkSize <= 0) throw "Invalid chunk size";
	  var R = [];
	  for (var i=0,len=arr.length; i<len; i+=chunkSize)
	    R.push(arr.slice(i,i+chunkSize));
	  return R;
	}

	var isNumeric = function(num){
	  return !isNaN(num)
	}

	var getDaysArray = function(start, end) {
	    for(var arr=[],dt=new Date(start); dt<=end; dt.setDate(dt.getDate()+1)){
	        arr.push(new Date(dt));
	    }
	    return arr;
	};


	if (request.params.quarter){
		request.params.quarter = request.params.quarter.toUpperCase()
	}


	let qlookup = {'Q1': ['-10-01','-12-31'],
	'Q2': ['-01-01','-03-31'],
	'Q3': ['-04-01','-06-30'],
	'Q4': ['-07-01','-09-30']}



	if (!isNumeric(request.params.year) || request.params.year.length < 4){
		response.send('Year does not look like  a year')
		return false
	}

	if (!qlookup[request.params.quarter]){
		response.send('Year does not look like  a valid quarter')
		return false
	}


	let start_date = request.params.year + qlookup[request.params.quarter][0]
	let end_date = request.params.year + qlookup[request.params.quarter][1]


	let start_time = new Date(start_date).getTime() / 1000
	let end_time = new Date(end_date).getTime() / 1000


  	let day_list = getDaysArray(new Date(start_date),new Date(end_date))


  	day_chunks = chunk(day_list,7)

  	let report = {}

  	for (let day_chunk of day_chunks){


  		report[day_chunk[0].toISOString().split('T')[0]] = {
  			// label: day_chunk[0].toISOString().split('T')[0],
  			label: (day_chunk[0].getMonth() + 1) + '/' + day_chunk[0].getDate() + '/' + day_chunk[0].getFullYear(),
  			days: day_chunk.map((d)=>{return d.toISOString().split('T')[0]}),
  			users: {}
  		}

  	}


	MongoClient.connect(uri, function(err, client) {

		const db = client.db('bfe2');

		var cursor = db.collection('resourcesProduction').find({});
		let all_users = {}
		cursor.forEach((doc)=>{


			// only work on records built between our ranges
			if (doc.index && doc.index.timestamp && doc.index.timestamp>=  start_time && doc.index.timestamp <= end_time){


				if (!all_users[doc.index.user]){
					all_users[doc.index.user] = 0
				}



				for (let key in report){

					for (let day of report[key].days){
						if (doc.index.time.includes(day)){

							// it contains one of the days, it belongs in this bucket

							if (!report[key].users[doc.index.user]){
								report[key].users[doc.index.user]=0
							}

							report[key].users[doc.index.user]++


						}


					}


				}



			}






		}, function(err){

			let all_users_alpha = Object.keys(all_users).sort()




			let csvResults = `${request.params.year}${request.params.quarter} Editor Stats, By Cataloger\n`

			csvResults = csvResults +'Cataloger,' + Object.keys(report).map((k)=>{ return report[k].label }).join(',') + ',Created Totals\n'





			for (let u of all_users_alpha){

				let row = [u]

				for (let key in report){

					// did they have activity for this week
					if (report[key].users[u]){
						row.push(report[key].users[u])

						// add to the tottal
						all_users[u] = all_users[u] +  report[key].users[u]
					}else{
						row.push(0)
					}



				}

				// add in the tottal
				row.push(all_users[u])


				csvResults = csvResults + row.join(',') +'\n'

			}

			let totals = ['Created Total']
			let all_total = 0
			for (let key in report){

				let t = 0
				for (let u in report[key].users){
					t = t +  report[key].users[u]
					all_total = all_total + report[key].users[u]
				}

				totals.push(t)
			}
			totals.push(all_total)

			csvResults = csvResults + totals.join(',')





			response.attachment(`stats_new_editor_${request.params.year}${request.params.quarter}.csv`);
			response.status(200).send(csvResults);

		})







	});


});


app.post('/delete/:stage/:user/:eid', (request, response) => {

	let result = false

	if (request.params.stage == 'staging'){
		if (recsStageByUser[request.params.user]){
			if (recsStageByUser[request.params.user][request.params.eid]){
				recsStageByUser[request.params.user][request.params.eid].status = 'deleted'
				result = true
			}
		}
		if (recsStageByEid[request.params.eid]){
			recsStageByEid[request.params.eid].status = 'deleted'
			result = true
		}

	    MongoClient.connect(uri, function(err, db) {
	        if (err) throw err;
	        var dbo = db.db("bfe2");
	        if (err) throw err;
			dbo.collection('resourcesStaging').findOne({'_id':new mongo.ObjectID(recsStageByEid[request.params.eid]._id)})
			.then(function(doc) {
				if(!doc) throw new Error('No record found.');
				doc.index.status='deleted'
				dbo.collection('resourcesStaging').updateOne(
				    {'_id':new mongo.ObjectID(recsStageByEid[request.params.eid]._id)},
				    { $set: doc }

				);
			});
	    });





	}else{
		if (recsProdByUser[request.params.user]){
			if (recsProdByUser[request.params.user][request.params.eid]){
				recsProdByUser[request.params.user][request.params.eid].status = 'deleted'
				result = true
			}
		}
		if (recsProdByEid[request.params.eid]){
			recsProdByEid[request.params.eid].status = 'deleted'
			result = true
		}

		// POTENTAIL ERROR HERE, IF THE RECORD IS NOT iN THE recsProdByEid object becase it is > 2weeks
	    MongoClient.connect(uri, function(err, db) {
	        if (err) throw err;
	        var dbo = db.db("bfe2");
	        if (err) throw err;
			dbo.collection('resourcesProduction').findOne({'_id':new mongo.ObjectID(recsProdByEid[request.params.eid]._id)})
			.then(function(doc) {
				if(!doc) throw new Error('No record found.');
				doc.index.status='deleted'
				dbo.collection('resourcesProduction').updateOne(
				    {'_id':new mongo.ObjectID(recsProdByEid[request.params.eid]._id)},
				    { $set: doc }

				);
			});
	    });



	}


	response.json({'result':result});


})

app.post('/error/report', (request, response) => {

    MongoClient.connect(uri, function(err, db) {
        if (err) throw err;
        var dbo = db.db("bfe2");

        // turn it back into a string for storage because mongo is fusssy about key IDs
        request.body.activeProfile = JSON.stringify(request.body.activeProfile)
        dbo.collection("errorReports").insertOne(request.body,
        function(err, result) {
            if (err) {
            	response.json({'result':false,'error':err});
            }
            response.json({'result':true,'error':err});
            db.close();
        });
    });
});


app.get('/errordoc/:hash', (request, response) => {

	let found = false
	fs.readdirSync('/tmp/marva_error_reports/').forEach(file => {
		if (request.params.hash == crypto.createHash('md5').update(file).digest("hex")){


			let txt = fs.readFileSync('/tmp/marva_error_reports/'+file,{encoding:'utf8', flag:'r'})
			if (fs.existsSync('/tmp/marva_error_reports/'+file.replace('.txt','.json'))){
				txt = txt + '-------------------------------------\n'+fs.readFileSync('/tmp/marva_error_reports/'+file.replace('.txt','.json'),{encoding:'utf8', flag:'r'})
			}


			response.type('text/plain').status(200).send(txt);
			found=true
		}
	})

	if (!found){
		response.status(404).send('not found')
	}
});

app.get('/errorlog', (request, response) => {

	let files = {}

	fs.readdirSync('/tmp/marva_error_reports/').forEach(file => {
	  let s = file.split('_')
	  files[s[0]] = file
	})

	let keys = Object.keys(files).sort().reverse().slice(0, 50);

	let names = {}
	for (let k of keys){

		names[crypto.createHash('md5').update(`${files[k]}`).digest("hex")] = files[k]

	}


	response.json(names)


});

app.post('/errorlog', (request, response) => {


	if (!fs.existsSync('/tmp/marva_error_reports/')){
		fs.mkdirSync('/tmp/marva_error_reports/');
	}

	let filename = request.body.filename.replace(/\//g,'')

	fs.writeFileSync(`/tmp/marva_error_reports/${filename}`, request.body.log);
	fs.writeFileSync(`/tmp/marva_error_reports/${filename.replace('.txt','.json')}`, request.body.profile);

	response.status(200).send('ok');


});

app.get('/sourcelog/:hash', (request, response) => {

	let found = false
	fs.readdirSync('/tmp/marva_source_log/').forEach(file => {
		if (request.params.hash == crypto.createHash('md5').update(file).digest("hex")){

			response.type('text/plain').status(200).send(fs.readFileSync('/tmp/marva_source_log/'+file,{encoding:'utf8', flag:'r'}));
			found=true
		}
	})

	if (!found){
		response.status(404).send('not found')
	}
});

app.get('/sourcelog', (request, response) => {

	let files = {}

	fs.readdirSync('/tmp/marva_source_log/').forEach(file => {
	  let s = file.split('_')
	  files[s[0]] = file
	})

	let keys = Object.keys(files).sort().reverse().slice(0, 100);

	let names = {}
	for (let k of keys){

		names[crypto.createHash('md5').update(`${files[k]}`).digest("hex")] = files[k]

	}


	response.json(names)


});

app.post('/sourcelog', (request, response) => {


	if (!fs.existsSync('/tmp/marva_source_log/')){
		fs.mkdirSync('/tmp/marva_source_log/');
	}

	let stamp = Math.floor(Date.now() / 1000)

	let filename = `${stamp}_${request.body.eid}_${request.body.user}_${request.body.date}.xml`

	fs.writeFileSync(`/tmp/marva_source_log/${filename}`, request.body.xml);

	response.status(200).send('ok');


});














app.get('/error/report', (request, response) => {

    MongoClient.connect(uri, function(err, db) {
        if (err) throw err;
        var dbo = db.db("bfe2");
		    var cursor = dbo.collection('errorReports').find({});
		    let results = []
		 		cursor.forEach((doc)=>{
		 			results.push({id:doc._id,eId:doc.eId,desc:doc.desc,contact:doc.contact})
		 		}, function(err) {
			 		response.json(results.reverse())
				})


    });
});

app.get('/error/:errorId', (request, response) => {

		try{
			new mongo.ObjectID(request.params.errorId)
		}catch{
			response.json(false);
			return false
		}



    MongoClient.connect(uri, function(err, db) {
        if (err) throw err;
        var dbo = db.db("bfe2");

				dbo.collection('errorReports').findOne({'_id':new mongo.ObjectID(request.params.errorId)})
				.then(function(doc) {

					response.type("application/json");


					if(!doc){
						response.json(false);
					}else{


						if (request.query.download){
							response.attachment(`${doc.eId}.json`);
							doc = JSON.parse(doc.activeProfile)
							response.type('json').send(JSON.stringify(doc, null, 2) + '\n');

						}else{
							doc = JSON.parse(doc.activeProfile)

							response.type('json').send(JSON.stringify(doc, null, 2) + '\n');

						}



					}
				});
    });
});




app.post('/publish/production', async (request, response) => {

	// var shortuuid = require('short-uuid');
	// var decimaltranslator = shortuuid("0123456789");
	// var objid = req.body.objid;
	// var lccn = req.body.lccn;
	// var dirname = __dirname + resources;

	var name = request.body.name + ".rdf";
	var rdfxml = request.body.rdfxml;

	let endpoint = "/controllers/ingest/bf-bib.xqy"

	if (request.body.hub === true){
		endpoint = "/controllers/ingest/bf-hub.xqy"
	}

	var url = "https://" + PRODUCTIONPOSTURL.trim() + endpoint;
	// console.log('------')
	// console.log(request.body.rdfxml)
	// console.log('------')
	// console.log('posting to',url)


	let postLogEntry = {
		'postingDate': new Date(),
		'postingEnv': 'production',
		'postingTo': url,
		'postingXML': request.body.rdfxml,

	}


	try{

		const postResponse = await got.post(url, {
			body: rdfxml,
			username:MLUSER,
			password:MLPASS,
			headers: {
				"Content-type": "application/xml",
				'user-agent': 'marva-backend'
			}

		});

		postLogEntry['postingStatus'] = 'success'
		postLogEntry['postingStatusCode'] = 200
		postLogEntry['postingBodyResponse'] = postResponse.body
		postLogEntry['postingName'] = request.body.name
		postLog.push(postLogEntry)
		if (postLogEntry.length>50){
			postLogEntry.shift()
		}
		let postStatus = {"status":"published"}

		if (postResponse.statusCode != 201 && postResponse.statusCode != 204 ){
			postStatus = {"status": "error","server": url, "message": postResponse.statusCode }
		}
		let postLocation = null
		if (postResponse.headers && postResponse.headers.location){
			postLocation=postResponse.headers.location
		}


		let resp_data = {
			name: request.body.name,
			// "url": resources + name,
			//"objid": data.objid,
			// "lccn": lccn,
			publish: postStatus,
			postLocation:postLocation
		}

		response.set('Content-Type', 'application/json');
		response.status(200).send(resp_data);




	}catch(err){


		postLogEntry['postingStatus'] = 'error'
		postLogEntry['postingStatusCode'] =  err.response.statusCode
		postLogEntry['postingBodyResponse'] = err.response.body
		postLogEntry['postingBodyName'] = request.body.name
		postLogEntry['postingEid'] = request.body.eid

		postLog.push(postLogEntry)
		if (postLogEntry.length>50){
			postLogEntry.shift()
		}


		errString = JSON.stringify(err.response.body)
		let replace = `${MLUSER}|${MLPASS}`;
		let re = new RegExp(replace,"g");
		errString = errString.replace(re, ",'****')");
		errString = JSON.parse(errString)



		resp_data = {
				"name": request.body.name,
				"objid":  "objid",
				"publish": {"status": "error","server": url,"message": errString }
			}
		response.set('Content-Type', 'application/json');
		response.status(500).send(resp_data);


	}



	// var options = {
	//     method: 'POST',
	//     uri: url,
	//     body: rdfxml,
	//     resolveWithFullResponse: true,
	//     headers: { "Content-type": "application/xml" },
	//     auth: {
	//             'user': MLUSER,
	//             'pass': MLPASS,
	//         },
	//     json: false // Takes JSON as string and converts to Object
	// };
	// rp(options)
	//     .then(function (postResponse) {
	//         // {"name": "72a0a1b6-2eb8-4ee6-8bdf-cd89760d9f9a.rdf","objid": "/resources/instances/c0209952430001",
	//         // "publish": {"status": "success","message": "posted"}}

	//         postLogEntry['postingStatus'] = 'success'
	//         postLogEntry['postingStatusCode'] = postResponse.statusCode
	//         postLogEntry['postingBodyResponse'] = postResponse.body
	//         postLogEntry['postingName'] = request.body.name
	// 	    postLog.push(postLogEntry)
	// 	    if (postLogEntry.length>50){
	// 	    	postLogEntry.shift()
	// 	    }



	//         let postStatus = {"status":"published"}

	//         if (postResponse.statusCode != 201 && postResponse.statusCode != 204 ){
	//         	postStatus = {"status": "error","server": url, "message": postResponse.statusCode }
	//         }

	// 		let resp_data = {
    //             name: request.body.name,
    //             // "url": resources + name,
    //             //"objid": data.objid,
    //             // "lccn": lccn,
    //             publish: postStatus
    //         }


	//         response.set('Content-Type', 'application/json');
	//         response.status(200).send(resp_data);
	//     })
	//     .catch(function (err) {
	//         // POST failed...
	//         console.log(err)

	//         postLogEntry['postingStatus'] = 'error'
	//         postLogEntry['postingStatusCode'] =  err.StatusCodeError
	//         postLogEntry['postingBodyResponse'] = err
	//         postLogEntry['postingBodyName'] = request.body.name
	//         postLogEntry['postingEid'] = request.body.eid

	//         postLog.push(postLogEntry)
	//         if (postLogEntry.length>50){
	//         	postLogEntry.shift()
	//         }


	//         errString = JSON.stringify(err)
	// 		let replace = `${MLUSER}|${MLPASS}`;
	// 		let re = new RegExp(replace,"g");
	// 		errString = errString.replace(re, ",'****')");
	//         err = JSON.parse(errString)



	//         resp_data = {
	//                 "name": request.body.name,
	//                 "objid":  "objid",
	//                 "publish": {"status": "error","server": url,"message": err }
	//             }
	//         response.set('Content-Type', 'application/json');
	//         response.status(500).send(resp_data);
	//     });



});

app.post('/publish/staging', async (request, response) => {

	// var shortuuid = require('short-uuid');
	// var decimaltranslator = shortuuid("0123456789");
	// var objid = req.body.objid;
	// var lccn = req.body.lccn;
	// var dirname = __dirname + resources;

	var name = request.body.name + ".rdf";
	var rdfxml = request.body.rdfxml;

	let endpoint = "/controllers/ingest/bf-bib.xqy"

	if (request.body.hub === true){
		endpoint = "/controllers/ingest/bf-hub.xqy"
		console.log('using Hub END POInT')
	}

	var url = "https://" + STAGINGPOSTURL.trim() + endpoint;
	console.log('------')
	console.log(request.body.rdfxml)
	console.log('------')
	console.log('posting to', url)


	let postLogEntry = {
		'postingDate': new Date(),
		'postingEnv': 'production',
		'postingTo': url,
		'postingXML': request.body.rdfxml,

	}

	try{

		const postResponse = await got.post(url, {
			body: rdfxml,
			username:MLUSERSTAGE,
			password:MLPASSSTAGE,
			headers: {
				"Content-type": "application/xml",
				'user-agent': 'marva-backend'
			}

		});

		postLogEntry['postingStatus'] = 'success'
		postLogEntry['postingStatusCode'] = postResponse.statusCode
		postLogEntry['postingBodyResponse'] = postResponse.body
		postLogEntry['postingName'] = request.body.name
		postLog.push(postLogEntry)
		if (postLogEntry.length>50){
			postLogEntry.shift()
		}
		let postStatus = {"status":"published"}

		if (postResponse.statusCode != 201 && postResponse.statusCode != 204 ){
			postStatus = {"status": "error","server": url, "message": postResponse.statusCode }
		}
		let postLocation = null
		if (postResponse.headers && postResponse.headers.location){
			postLocation=postResponse.headers.location
		}

		let resp_data = {
			name: request.body.name,
			// "url": resources + name,
			//"objid": data.objid,
			// "lccn": lccn,
			publish: postStatus,
			postLocation:postLocation
		}

		response.set('Content-Type', 'application/json');
		response.status(200).send(resp_data);




	}catch(err){
		console.error(err)



		errString = JSON.stringify(err)
		let replace = `${MLUSERSTAGE}|${MLPASSSTAGE}`;
		let re = new RegExp(replace,"g");
		errString = errString.replace(re, ",'****')");
		err = JSON.parse(errString)

		console.log("-----errString------")
		console.log(errString)
		console.log("----------------------")
		console.log("ERror code", err.StatusCodeError)

		postLogEntry['postingStatus'] = 'error'
		postLogEntry['postingStatusCode'] =  err.StatusCodeError
		postLogEntry['postingBodyResponse'] = err.response.body
		postLogEntry['postingBodyName'] = request.body.name
		postLogEntry['postingEid'] = request.body.eid
		postLog.push(postLogEntry)
		if (postLogEntry.length>50){
			postLogEntry.shift()
		}


		resp_data = {
				"name": request.body.name,
				"objid":  "objid",
				"publish": {"status": "error","server": url,"message": err.response.body }
			}
		response.set('Content-Type', 'application/json');
		response.status(500).send(resp_data);



	}




	// var options = {
	//     method: 'POST',
	//     uri: url,
	//     body: rdfxml,
	//     resolveWithFullResponse: true,
	//     headers: { "Content-type": "application/xml" },
	//     auth: {
	//             'user': MLUSERSTAGE,
	//             'pass': MLPASSSTAGE,
	//         },
	//     json: false // Takes JSON as string and converts to Object
	// };
	// rp(options)
	//     .then(function (postResponse) {
	//         // {"name": "72a0a1b6-2eb8-4ee6-8bdf-cd89760d9f9a.rdf","objid": "/resources/instances/c0209952430001",
	//         // "publish": {"status": "success","message": "posted"}}

	//         postLogEntry['postingStatus'] = 'success'
	//         postLogEntry['postingStatusCode'] = postResponse.statusCode
	//         postLogEntry['postingBodyResponse'] = postResponse.body
	//         postLogEntry['postingName'] = request.body.name

	// 	    postLog.push(postLogEntry)
	// 	    if (postLogEntry.length>50){
	// 	    	postLogEntry.shift()
	// 	    }

	//         console.log(postResponse)
	//         let postStatus = {"status":"published"}

	//         if (postResponse.statusCode != 201 && postResponse.statusCode != 204 ){
	//         	postStatus = {"status": "error","server": url, "message": postResponse.statusCode }
	//         }

	// 		let resp_data = {
    //             name: request.body.name,
    //             // "url": resources + name,
    //             //"objid": data.objid,
    //             // "lccn": lccn,
    //             publish: postStatus
    //         }


	//         response.set('Content-Type', 'application/json');
	//         response.status(200).send(resp_data);
	//     })
	//     .catch(function (err) {
	//         // POST failed...

	//         errString = JSON.stringify(err)
	// 		let replace = `${MLUSERSTAGE}|${MLPASSSTAGE}`;
	// 		let re = new RegExp(replace,"g");
	// 		errString = errString.replace(re, ",'****')");
	//         err = JSON.parse(errString)



	//         postLogEntry['postingStatus'] = 'error'
	//         postLogEntry['postingStatusCode'] =  err.StatusCodeError
	//         postLogEntry['postingBodyResponse'] = err
	//         postLogEntry['postingBodyName'] = request.body.name
	//         postLogEntry['postingEid'] = request.body.eid
	// 	    postLog.push(postLogEntry)
	// 	    if (postLogEntry.length>50){
	// 	    	postLogEntry.shift()
	// 	    }


	//         resp_data = {
	//                 "name": request.body.name,
	//                 "objid":  "objid",
	//                 "publish": {"status": "error","server": url,"message": err }
	//             }
	//         response.set('Content-Type', 'application/json');
	//         response.status(500).send(resp_data);
	//     });





});


app.post('/nacostub/staging', async (request, response) => {


	var name = request.body.name + ".xml";
	var marcxml = request.body.marcxml;

	let endpoint = "/controllers/ingest/marc-auth.xqy"


	var url = "https://" + STAGINGNACOSTUB.trim() + endpoint;
	console.log('------')
	console.log(request.body.marcxml)
	console.log('------')
	console.log('posting to',url)


	let postLogEntry = {
		'postingDate': new Date(),
		'postingEnv': 'production',
		'postingTo': url,
		'postingXML': request.body.marcxml,

	}

	try{

		const postResponse = await got.post(url, {
			body: marcxml,
			username:MLUSERSTAGE,
			password:MLPASSSTAGE,
			headers: {
				"Content-type": "application/xml",
				'user-agent': 'marva-backend'
			}

		});

		postLogEntry['postingStatus'] = 'success'
		postLogEntry['postingStatusCode'] = postResponse.statusCode
		postLogEntry['postingBodyResponse'] = postResponse.body
		// postLogEntry['postingName'] = request.body.name
		postLog.push(postLogEntry)
		if (postLogEntry.length>50){
			postLogEntry.shift()
		}
		let postStatus = {"status":"published"}

		if (postResponse.statusCode != 201 && postResponse.statusCode != 204 ){
			postStatus = {"status": "error","server": url, "message": postResponse.statusCode }
		}
		let postLocation = null
		if (postResponse.headers && postResponse.headers.location){
			postLocation=postResponse.headers.location
		}

		let resp_data = {
			// name: request.body.name,
			// "url": resources + name,
			//"objid": data.objid,
			// "lccn": lccn,
			publish: postStatus,
			postLocation:postLocation
		}

		response.set('Content-Type', 'application/json');
		response.status(200).send(resp_data);




	}catch(err){
		console.error(err)

		let errorMessage = "No Message"

		if (err && err.response){
			console.log("err response:")
			console.log(err.response)
			if (err.response.body){
				errorMessage=err.response.body
			}
		}else{
			console.log("No Error response!")
		}


		errString = JSON.stringify(err)
		let replace = `${MLUSERSTAGE}|${MLPASSSTAGE}`;
		let re = new RegExp(replace,"g");
		errString = errString.replace(re, ",'****')");
		err = JSON.parse(errString)

		console.log("-----errString------")
		console.log(errString)
		console.log("----------------------")
		console.log("ERror code", err.StatusCodeError)



		postLogEntry['postingStatus'] = 'error'
		postLogEntry['postingStatusCode'] =  (err && err.StatusCodeError) ? err.StatusCodeError : "No err.StatusCodeError"
		postLogEntry['postingBodyResponse'] = (err && err.response && err.response.body) ? err.response.body : "no err.response.body"
		// postLogEntry['postingBodyName'] = request.body.name
		// postLogEntry['postingEid'] = request.body.eid
		postLog.push(postLogEntry)
		if (postLogEntry.length>50){
			postLogEntry.shift()
		}


		resp_data = {
				"name": request.body.name,
				"objid":  "objid",
				"publish": {"status": "error","server": url,"message": (err && err.response && err.response.body) ? err.response.body : "No body text?", "errorMessage": errorMessage }
			}
		response.set('Content-Type', 'application/json');
		response.status(500).send(resp_data);



	}



});

app.post('/nacostub/production', async (request, response) => {


	var name = request.body.name + ".xml";
	var marcxml = request.body.marcxml;

	let endpoint = "/controllers/ingest/marc-auth.xqy"


	var url = "https://" + PRODUCTIONNACOSTUB.trim() + endpoint;
	console.log('------')
	console.log(request.body.marcxml)
	console.log('------')
	console.log('posting to',url)


	let postLogEntry = {
		'postingDate': new Date(),
		'postingEnv': 'production',
		'postingTo': url,
		'postingXML': request.body.marcxml,

	}

	try{

		const postResponse = await got.post(url, {
			body: marcxml,
			username:MLUSER,
			password:MLPASS,
			headers: {
				"Content-type": "application/xml",
				'user-agent': 'marva-backend'
			}

		});

		postLogEntry['postingStatus'] = 'success'
		postLogEntry['postingStatusCode'] = postResponse.statusCode
		postLogEntry['postingBodyResponse'] = postResponse.body
		// postLogEntry['postingName'] = request.body.name
		postLog.push(postLogEntry)
		if (postLogEntry.length>50){
			postLogEntry.shift()
		}
		let postStatus = {"status":"published"}

		if (postResponse.statusCode != 201 && postResponse.statusCode != 204 ){
			postStatus = {"status": "error","server": url, "message": postResponse.statusCode }
		}
		let postLocation = null
		if (postResponse.headers && postResponse.headers.location){
			postLocation=postResponse.headers.location
		}

		let resp_data = {
			// name: request.body.name,
			// "url": resources + name,
			//"objid": data.objid,
			// "lccn": lccn,
			publish: postStatus,
			postLocation:postLocation
		}

		response.set('Content-Type', 'application/json');
		response.status(200).send(resp_data);




	}catch(err){
		console.error(err)

		let errorMessage = "No Message"

		if (err && err.response){
			console.log("err response:")
			console.log(err.response)
			if (err.response.body){
				errorMessage=err.response.body
			}
		}else{
			console.log("No Error response!")
		}


		errString = JSON.stringify(err)
		let replace = `${MLUSER}|${MLPASS}`;
		let re = new RegExp(replace,"g");
		errString = errString.replace(re, ",'****')");
		err = JSON.parse(errString)

		console.log("-----errString------")
		console.log(errString)
		console.log("----------------------")
		console.log("ERror code", err.StatusCodeError)



		postLogEntry['postingStatus'] = 'error'
		postLogEntry['postingStatusCode'] =  (err && err.StatusCodeError) ? err.StatusCodeError : "No err.StatusCodeError"
		postLogEntry['postingBodyResponse'] = (err && err.response && err.response.body) ? err.response.body : "no err.response.body"
		// postLogEntry['postingBodyName'] = request.body.name
		// postLogEntry['postingEid'] = request.body.eid
		postLog.push(postLogEntry)
		if (postLogEntry.length>50){
			postLogEntry.shift()
		}


		resp_data = {
				"name": request.body.name,
				"objid":  "objid",
				"publish": {"status": "error","server": url,"message": (err && err.response && err.response.body) ? err.response.body : "No body text?", "errorMessage": errorMessage }
			}
		response.set('Content-Type', 'application/json');
		response.status(500).send(resp_data);



	}



});

app.get('/myrecords/production/:user', function(request, response){
	// console.log('recsProdByUser',recsProdByUser)
	if (request.params.user){
		response.json(recsProdByUser[request.params.user]);
	}else{
		response.json({});
	}
});

app.get('/allrecords/production', function(request, response){
	response.json(recsProdByEid);
});


app.get('/allrecords/production/stats', function(request, response){
	MongoClient.connect(uri, function(err, client) {
		if (err) {
			return response.status(500).json({ error: 'Database connection failed' });
		}

		const db = client.db('bfe2');
		const collection = db.collection('resourcesProduction');

		// Use aggregation to compute stats server-side (avoids loading all docs into memory)
		collection.aggregate([
			{
				$facet: {
					totalCount: [{ $count: 'count' }],
					withIndex: [
						{ $match: { index: { $exists: true } } },
						{ $count: 'count' }
					],
					byUser: [
						{ $match: { 'index.user': { $exists: true } } },
						{ $group: { _id: '$index.user', count: { $sum: 1 } } },
						{ $sort: { count: -1 } }
					],
					byStatus: [
						{ $match: { 'index.status': { $exists: true } } },
						{ $group: { _id: '$index.status', count: { $sum: 1 } } }
					],
					dateRange: [
						{ $match: { 'index.timestamp': { $exists: true } } },
						{
							$group: {
								_id: null,
								earliest: { $min: '$index.timestamp' },
								latest: { $max: '$index.timestamp' }
							}
						}
					],
					sampleDoc: [
						{ $match: { index: { $exists: true } } },
						{ $limit: 1 },
						{ $project: { index: 1, _id: 0 } }
					]
				}
			}
		]).toArray(function(err, results) {
			client.close();

			if (err) {
				return response.status(500).json({ error: 'Aggregation failed', details: err.message });
			}

			const data = results[0];
			const dateRange = data.dateRange[0] || {};

			const stats = {
				totalRecords: (data.totalCount[0] && data.totalCount[0].count) || 0,
				recordsWithIndex: (data.withIndex[0] && data.withIndex[0].count) || 0,
				users: {},
				statuses: {},
				dateRange: {
					earliest: dateRange.earliest || null,
					latest: dateRange.latest || null,
					earliestDate: dateRange.earliest ? new Date(dateRange.earliest * 1000).toISOString() : null,
					latestDate: dateRange.latest ? new Date(dateRange.latest * 1000).toISOString() : null
				},
				indexFieldsSample: (data.sampleDoc[0] && data.sampleDoc[0].index) ? Object.keys(data.sampleDoc[0].index) : []
			};

			data.byUser.forEach(function(u) {
				stats.users[u._id] = u.count;
			});

			data.byStatus.forEach(function(s) {
				stats.statuses[s._id] = s.count;
			});

			response.json(stats);
		});
	});
});


app.get('/logs/posts', function(request, response){
	response.json(postLog);
});


// Cleanup job state (for async tracking)
var cleanupJobStatus = {
	running: false,
	lastRun: null,
	lastResult: null
};

app.get('/cleanup/old-records', function(request, response){
	// Require confirmation param to prevent accidental triggering
	if (request.query.confirm !== 'yes-delete-old-records') {
		return response.status(400).json({
			error: 'Missing or invalid confirmation parameter',
			usage: 'GET /cleanup/old-records?confirm=yes-delete-old-records',
			description: 'Deletes records older than 6 months from resourcesProduction and resourcesStaging, then compacts the database'
		});
	}

	// Check if already running
	if (cleanupJobStatus.running) {
		return response.status(409).json({
			error: 'Cleanup job already in progress',
			startedAt: cleanupJobStatus.lastRun
		});
	}

	// Mark as running and respond immediately
	cleanupJobStatus.running = true;
	cleanupJobStatus.lastRun = new Date().toISOString();
	cleanupJobStatus.lastResult = null;

	response.json({
		message: 'Cleanup job started',
		startedAt: cleanupJobStatus.lastRun,
		checkStatus: 'GET /cleanup/old-records/status'
	});

	// Run cleanup asynchronously
	const threeMonthsAgo = Math.floor(Date.now() / 1000) - (3 * 30 * 24 * 60 * 60);

	MongoClient.connect(uri, function(err, client) {
		if (err) {
			cleanupJobStatus.running = false;
			cleanupJobStatus.lastResult = { error: 'Database connection failed', details: err.message };
			return;
		}

		const db = client.db('bfe2');
		const result = {
			production: { deleted: 0 },
			staging: { deleted: 0 },
			compacted: false,
			completedAt: null,
			error: null
		};

		// Delete old records from production
		db.collection('resourcesProduction').deleteMany(
			{ 'index.timestamp': { $lt: threeMonthsAgo } },
			function(err, prodResult) {
				if (err) {
					result.production.error = err.message;
				} else {
					result.production.deleted = prodResult.deletedCount;
				}

				// Delete old records from staging
				db.collection('resourcesStaging').deleteMany(
					{ 'index.timestamp': { $lt: threeMonthsAgo } },
					function(err, stageResult) {
						if (err) {
							result.staging.error = err.message;
						} else {
							result.staging.deleted = stageResult.deletedCount;
						}

						// Compact the database to reclaim disk space (force:true required for replica sets)
						db.command({ compact: 'resourcesProduction', force: true }, function(err) {
							if (err) {
								result.production.compactError = err.message;
							} else {
								result.production.compacted = true;
							}

							db.command({ compact: 'resourcesStaging', force: true }, function(err) {
								if (err) {
									result.staging.compactError = err.message;
								} else {
									result.staging.compacted = true;
									result.compacted = true;
								}

								result.completedAt = new Date().toISOString();
								cleanupJobStatus.lastResult = result;
								cleanupJobStatus.running = false;
								client.close();
							});
						});
					}
				);
			}
		);
	});
});

app.get('/cleanup/old-records/status', function(request, response){
	response.json({
		running: cleanupJobStatus.running,
		lastRun: cleanupJobStatus.lastRun,
		lastResult: cleanupJobStatus.lastResult
	});
});


app.get('/myrecords/staging/:user', function(request, response){
	if (request.params.user){
		response.json(recsStageByUser[request.params.user]);
	}else{
		response.json({});
	}
});


app.get('/allrecords/staging', function(request, response){

	response.json(recsStageByEid);
});



app.get('/allrecords/:env/:searchval/:user', function(request, response){



	let env = 'resourcesProduction'
	if (request.params.env === 'staging'){
		env = 'resourcesStaging'
	}

	let results = {}
	let search = request.params.searchval.toLowerCase()

	MongoClient.connect(uri, function(err, client) {

	    const db = client.db('bfe2');

		var searchCursor = db.collection(env).find({});

		searchCursor.forEach((doc)=>{

			if (doc.index){



					if (doc.index.eid){

						if (request.params.user && request.params.user != 'all'){
							if (doc.index.user != request.params.user){
								return
							}
						}


						if (doc.index.title && doc.index.title.toString().toLowerCase().includes(search)){
							results[doc.index.eid] = doc.index
						}else if (doc.index.eid.toLowerCase().includes(search)){
							results[doc.index.eid] = doc.index
						}else if (doc.index.lccn && doc.index.lccn.toString().includes(search)){
							results[doc.index.eid] = doc.index
						}else if (doc.index.user && doc.index.user.toString().toLowerCase().includes(search)){
							results[doc.index.eid] = doc.index
						}else if (doc.index.contributor && doc.index.contributor.toString().toLowerCase().includes(search)){

							results[doc.index.eid] = doc.index
						}

						//



					}
			}

		}).then(function() {

			// console.log(request.params.user, request.params.searchval)
			response.json(results);

		})





	})






});


// app.post('/preferences', async (request, response) => {

//     MongoClient.connect(uri, async function(err, db) {
//         if (err) throw err;
//         var dbo = db.db("bfe2");

//         // find the key to update
// 		let doc = await dbo.collection('preferences').findOne({id: request.body.id})
// 		if (doc){

// 			dbo.collection('preferences').updateOne(
// 			    {'_id': new mongo.ObjectID(doc['_id'])},
// 			    { $set: request.body }
// 			);



// 		}else{
// 			console.log("creating")


// 	        dbo.collection("templates").insertOne(request.body,
// 	        function(err, result) {
// 	            if (err) {
// 	            	console.log(err)
// 	            }
// 	        });
// 		}

// 		db.close();

// 		// dbo.collection('profiles').collectionName.remove( { } )
//     });

//     return response.status(200).send("yeah :)")
// });








app.get('/lccnnaco/set/:set', function(request, response){


	if (request.params.set){
		let setTo = parseInt(request.params.set)


		let correctlogin = 'INCORRECTLOGINVALUE'
		if (request.headers.authorization){
			correctlogin = Buffer.from(`${process.env.DEPLOYPW.replace(/"/g,'')}:${process.env.DEPLOYPW.replace(/"/g,'')}`).toString('base64')
		}
		if (  request.headers.authorization !== `Basic ${correctlogin}`){
			return response.set('WWW-Authenticate','Basic').status(401).send('Authentication required.') // Access denied.
		}
		// Access granted...
		// set nacoIdObj because it is in memory and used to ++ and return before interacting with the db
		nacoIdObj.id = setTo

		// update the database
		MongoClient.connect(uri, function(err, client) {
		    const db = client.db('bfe2');
			let result = db.collection('lccnNACO').updateOne(
			    {'_id': new mongo.ObjectID(nacoIdObj['_id'])},
			    { $set: {id:nacoIdObj.id } }
			);
		})
		response.status(200).send('Set to:' + setTo)
	}else{
		response.status(500).send('Missing param :set.')

	}

});




app.get('/lccnnaco', function(request, response){
	// ++ the naco id
	nacoIdObj.id++
	response.json(nacoIdObj);

	// update the database
	MongoClient.connect(uri, function(err, client) {
	    const db = client.db('bfe2');
		db.collection('lccnNACO').updateOne(
		    {'_id': new mongo.ObjectID(nacoIdObj['_id'])},
		    { $set: {id:nacoIdObj.id } }
		);
	})
});


app.get('/marva001/set/:set', function(request, response){
	// Set marva001 manually. Value should not include "in0"
	if (request.params.set){
		let setTo = parseInt(request.params.set)


		let correctlogin = 'INCORRECTLOGINVALUE'
		if (request.headers.authorization){
			correctlogin = Buffer.from(`${process.env.DEPLOYPW.replace(/"/g,'')}:${process.env.DEPLOYPW.replace(/"/g,'')}`).toString('base64')
		}
		if (  request.headers.authorization !== `Basic ${correctlogin}`){
			return response.set('WWW-Authenticate','Basic').status(401).send('Authentication required.') // Access denied.
		}
		// Access granted...
		// set marva001Obj because it is in memory and used to ++ and return before interacting with the db
		marva001Obj.id = setTo

		// update the database
		MongoClient.connect(uri, function(err, client) {
		    const db = client.db('bfe2');
			let result = db.collection('marva001').updateOne(
			    {'_id': new mongo.ObjectID(marva001Obj['_id'])},
			    { $set: {id:marva001Obj.id } }
			);
		})
		response.status(200).send('Set "marva001" to:' + setTo)
	}else{
		response.status(500).send('Missing param :set.')

	}

});

app.get('/marva001', function(request, response){
	let currentNumber = marva001Obj.id
	const month = new Date().getMonth()
	const fullYear = new Date().getFullYear();
	const currentYear = fullYear.toString().slice(-2);
	let recordYear = String(currentNumber).slice(1,3)

	// if the `recordYear` < currentYear, update year and reset to ...0001
	if (month == 1 && recordYear < currentYear){
		console.log("UPDATE MARVA 001 for year change")
		marva001Obj.id = currentNumber + 10000000 // update the year
		marva001Obj.id = Number(String(marva001Obj.id).slice(0, 3) + "0000000") // reset the number
	}

	let number = 'in0' + marva001Obj.id
	// ++ the marva 001 id
	marva001Obj.id++

	console.log("marva001Obj: ", marva001Obj)

	// send it
	response.json({'marva001': number});

	// update the database
	MongoClient.connect(uri, function(err, client) {
	const db = client.db('bfe2');
		db.collection('marva001').updateOne(
			{'_id': new mongo.ObjectID(marva001Obj['_id'])},
			{ $set: {id:marva001Obj.id } }
		);
	})
});


app.get('/deploy-production', function(request, response){

	let correctlogin = 'INCORRECTLOGINVALUE'
	if (request.headers.authorization){
		correctlogin = Buffer.from(`${process.env.DEPLOYPW.replace(/"/g,'')}:${process.env.DEPLOYPW.replace(/"/g,'')}`).toString('base64')
	}
  if (  request.headers.authorization !== `Basic ${correctlogin}`){
    return response.set('WWW-Authenticate','Basic').status(401).send('Authentication required.') // Access denied.
  }

  // Access granted...
	let r = shell.exec('./deploy-production.sh')
 	let r_html = `<h1>stdout</h1><pre><code>${r.stdout.toString()}</pre></code><hr><h1>stderr</h1><pre><code>${r.stderr.toString()}</pre></code>`

	// console.log(r_html)

  return response.status(200).send(r_html)

});

app.get('/deploy-production-quartz', function(request, response){

	let correctlogin = 'INCORRECTLOGINVALUE'
	if (request.headers.authorization){
		correctlogin = Buffer.from(`${process.env.DEPLOYPW.replace(/"/g,'')}:${process.env.DEPLOYPW.replace(/"/g,'')}`).toString('base64')
	}
  if (  request.headers.authorization !== `Basic ${correctlogin}`){
    return response.set('WWW-Authenticate','Basic').status(401).send('Authentication required.') // Access denied.
  }

  // Access granted...
	let r = shell.exec('./deploy-production-quartz.sh')
 	let r_html = `<h1>stdout</h1><pre><code>${r.stdout.toString()}</pre></code><hr><h1>stderr</h1><pre><code>${r.stderr.toString()}</pre></code>`

	// console.log(r_html)

  return response.status(200).send(r_html)

});


app.get('/deploy-staging', function(request, response){

	let correctlogin = 'INCORRECTLOGINVALUE'
	if (request.headers.authorization){
		correctlogin = Buffer.from(`${process.env.DEPLOYPW.replace(/"/g,'')}:${process.env.DEPLOYPW.replace(/"/g,'')}`).toString('base64')
	}
  if (  request.headers.authorization !== `Basic ${correctlogin}`){
    return response.set('WWW-Authenticate','Basic').status(401).send('Authentication required.') // Access denied.
  }

  // Access granted...
	let r = shell.exec('./deploy-staging.sh')
 	let r_html = `<h1>stdout</h1><pre><code>${r.stdout.toString()}</pre></code><hr><h1>stderr</h1><pre><code>${r.stderr.toString()}</pre></code>`

	// console.log(r_html)

  return response.status(200).send(r_html)

});
app.get('/deploy-staging-quartz', function(request, response){

	let correctlogin = 'INCORRECTLOGINVALUE'
	if (request.headers.authorization){
		correctlogin = Buffer.from(`${process.env.DEPLOYPW.replace(/"/g,'')}:${process.env.DEPLOYPW.replace(/"/g,'')}`).toString('base64')
	}
  if (  request.headers.authorization !== `Basic ${correctlogin}`){
    return response.set('WWW-Authenticate','Basic').status(401).send('Authentication required.') // Access denied.
  }

  // Access granted...
	let r = shell.exec('./deploy-staging-quartz.sh')
 	let r_html = `<h1>stdout</h1><pre><code>${r.stdout.toString()}</pre></code><hr><h1>stderr</h1><pre><code>${r.stderr.toString()}</pre></code>`

	// console.log(r_html)

  return response.status(200).send(r_html)

});

app.get('/deploy-profile-editor', function(request, response){

	// let correctlogin = 'INCORRECTLOGINVALUE'
	// if (request.headers.authorization){
	// 	correctlogin = Buffer.from(`${process.env.DEPLOYPW.replace(/"/g,'')}:${process.env.DEPLOYPW.replace(/"/g,'')}`).toString('base64')
	// }
 //  if (  request.headers.authorization !== `Basic ${correctlogin}`){
 //    return response.set('WWW-Authenticate','Basic').status(401).send('Authentication required.') // Access denied.
 //  }

  // Access granted...
	let r = shell.exec('./deploy-profile-editor.sh')
 	let r_html = `<h1>stdout</h1><pre><code>${r.stdout.toString()}</pre></code><hr><h1>stderr</h1><pre><code>${r.stderr.toString()}</pre></code>`

	// console.log(r_html)

  return response.status(200).send(r_html)

});



app.get('/dump/xml/prod', function(request, response){

	let correctlogin = 'INCORRECTLOGINVALUE'
	if (request.headers.authorization){
		correctlogin = Buffer.from(`${process.env.DEPLOYPW.replace(/"/g,'')}:${process.env.DEPLOYPW.replace(/"/g,'')}`).toString('base64')
	}
	if (  request.headers.authorization !== `Basic ${correctlogin}`){
		return response.set('WWW-Authenticate','Basic').status(401).send('Authentication required.') // Access denied.
	}

	fs.rmdirSync('/tmp/dumps/', { recursive: true });
	fs.mkdirSync('/tmp/dumps/');



	MongoClient.connect(uri, function(err, client) {

		const db = client.db('bfe2');

		var cursor = db.collection('resourcesProduction').find({});
		let all_users = {}
		cursor.forEach((doc)=>{


			let lastone = doc.versions.length-1



			// console.log(doc.index.status)
			// console.log(doc.index.eid)
			// console.log(typeof doc.versions[lastone].content)




			// if the sub dir doesnt exist make it
			if (!fs.existsSync('/tmp/dumps/'+doc.index.status)){
			    fs.mkdirSync('/tmp/dumps/'+doc.index.status);
			}


			if (typeof doc.versions[lastone].content === 'string'){
				fs.writeFileSync( '/tmp/dumps/'+doc.index.status + '/' + doc.index.eid + '.xml' , doc.versions[lastone].content)
			}



		}, function(err){


			if (err){
				response.status(500).send(err);
			}else{

				(async() => {

					await zip.zip('/tmp/dumps/', '/tmp/dumps.zip');

					let date_ob = new Date();



					let date = ("0" + date_ob.getDate()).slice(-2);


					let month = ("0" + (date_ob.getMonth() + 1)).slice(-2);


					let year = date_ob.getFullYear();


					let hours = date_ob.getHours();


					let minutes = date_ob.getMinutes();


					let seconds = date_ob.getSeconds();





					response.setHeader('Content-disposition', 'attachment; filename=bfe2_dump_' + year + "-" + month + "-" + date + '.zip');

					response.setHeader("content-type", "application/zip");

					fs.createReadStream("/tmp/dumps.zip").pipe(response);



				})();



			}

		})







	});


});



// --- end points for templates / views
// profile editor endpoints
app.post('/templates', async (request, response) => {

    MongoClient.connect(uri, async function(err, db) {
        if (err) throw err;
        var dbo = db.db("bfe2");

        // find the key to update
		let doc = await dbo.collection('templates').findOne({id: request.body.id})
		if (doc){

			dbo.collection('templates').updateOne(
			    {'_id': new mongo.ObjectID(doc['_id'])},
			    { $set: request.body }
			);

		}else{
			console.log("creating")


	        dbo.collection("templates").insertOne(request.body,
	        function(err, result) {
	            if (err) {
	            	console.log(err)
	            }
	        });
		}

		db.close();

		// dbo.collection('profiles').collectionName.remove( { } )
    });

    return response.status(200).send("yeah :)")
});


app.get('/templates/:user', async (request, response) => {

    MongoClient.connect(uri, async function(err, db) {
        if (err) throw err;
        var dbo = db.db("bfe2");

        dbo.collection('templates').find({"user":request.params.user}).toArray(function(err, result) {

            return response.status(200).json(result)
            db.close();
        });
		db.close();
    });
});


app.get('/copytemplate/:user/:id', async (request, response) => {

    MongoClient.connect(uri, async function(err, db) {
        if (err) throw err;

        var dbo = db.db("bfe2");

		let id = request.params.id
		let doc = await dbo.collection('templates').findOne({id: id})
		if (doc){



			// remove the _id change the id and change the user name
			delete doc['_id']
			doc.id = crypto.createHash('md5').update(`${new Date().getTime().toString()}${request.params.user}`).digest("hex");
			doc.user = request.params.user
			doc.timestamp = new Date().getTime() / 1000

			dbo.collection("templates").insertOne(doc,
			function(err, result) {
			    if (err) {
			    	console.log(err)
			    	response.status(500).send("Could save copy of template")
			    }
			    return response.status(200).send("Template copied")
			});



			db.close();



		}else{
			response.status(500).send("Could not find that ID to copy")
		}


	});


});

app.delete('/templates/:doc', async (request, response) => {

    MongoClient.connect(uri, async function(err, db) {
        if (err) throw err;

        var dbo = db.db("bfe2");

		let docName = request.params.doc
		let doc = await dbo.collection('templates').findOne({id: docName})
		if (doc){

			// remove the piece of the profile
			dbo.collection('templates').deleteOne({_id: new mongo.ObjectID(doc['_id']) });
		}else{
			response.status(500).send("Could not find that ID to remove")
		}
	});

	return response.status(200).send("yeah :)")

});



app.post("/validate/:loc", async (request, response) => {
	var rdfxml = request.body.rdfxml;
	let endpoint = "/controllers/xqapi-validate-resource.xqy"
	var url = "https://" + VALIDATIONURL.trim() + endpoint;

	console.log("validating against: ", url)
	let loc = request.params.loc
	if (loc == 'stage'){
		url = url.replace("preprod", "preprod-8299")
	}

	let postLogEntry = {
		'postingDate': new Date(),
		'postingEnv': 'production',
		'postingTo': url,
		'postingXML': request.body.rdfxml,
	}

	try {
		const postResponse = await got.post(url, {
			body: rdfxml,
			username:MLUSER,
			password:MLPASS,
			headers: {
				"Content-type": "application/xml",
				'user-agent': 'marva-backend'
			}
		});

		postLogEntry['postingStatus'] = 'success'
		postLogEntry['postingStatusCode'] = 200
		postLogEntry['postingBodyResponse'] = postResponse.body
		postLogEntry['postingName'] = request.body.name
		postLog.push(postLogEntry)
		if (postLogEntry.length>50){
			postLogEntry.shift()
		}
		let postStatus = {"status":"validated"}

		if (postResponse.statusCode != 200){
			postStatus = {"status": "error","server": url, "message": postResponse.statusCode }
		}

		let data = postResponse.body.replace(/(\r\n|\n|\r)/gm, "");
		const msg = data.replace(/.*<!--(.*?)-->.*/g, "$1");

		let validationMSG = null
		try {
			validationMSG = JSON.parse(msg)
		} catch(error) { //If there's no matches, there are no errors
			if (error instanceof SyntaxError){
				validationMSG = [{"level": "SUCCESS", "message": "No issues found."}]
			} else {
				validationMSG = [{"level": "ERROR", "message": "Something when wrong: " + error.message}]
			}
		}

		let resp_data = {
			status: postStatus,
			validation: validationMSG
		}

		response.set('Content-Type', 'application/json');
		response.status(200).send(resp_data);

	} catch(err) {
		console.log("----------------------")
		console.log("Error: ", err)
		console.log("::::::::::::::::::::::")
		postLogEntry['postingStatus'] = 'error'
		postLogEntry['postingStatusCode'] =  err.code
		postLogEntry['postingBodyResponse'] = err.message
		postLogEntry['postingBodyName'] = request.body.name
		postLogEntry['postingEid'] = request.body.eid

		postLog.push(postLogEntry)
		if (postLogEntry.length>50){
			postLogEntry.shift()
		}

		errString = JSON.stringify(err.message)
		let replace = `${MLUSER}|${MLPASS}`;
		let re = new RegExp(replace,"g");
		errString = errString.replace(re, ",'****')");
		errString = JSON.parse(errString)

		resp_data = {
				"validated": {"status": "error","server": url,"message": errString }
			}
		response.set('Content-Type', 'application/json');
		response.status(500).send(resp_data);
	}
});












// this is being rerouted from the profile editor



const updateGit = async function(docName,env,jsonPayload){




	// otherMetadataKeys = [
	// 	"index.resourceType:ontology",
	// 	"index.resourceType:vocabulary",
	// 	"index.resourceType:propertyTypes"
	// ]


  	// load the local deploy options
	let config = JSON.parse(fs.readFileSync('util_config.json', 'utf8'));

	if (config.profileEditPushGit){


	    fs.rmSync('/tmp/profiles/', { recursive: true, force: true });

	    await fs.promises.mkdir( '/tmp/profiles/' );
	    await fs.promises.mkdir( '/tmp/profiles/' + `${docName}-${env}` );
	    await fs.promises.mkdir( '/tmp/profiles/' + `${docName}-${env}/src` );

	    let gitConfig = JSON.parse(fs.readFileSync('gitconfig.json', 'utf8'));

	    let userName = gitConfig.userName
	    let password = gitConfig.password
	    let org = gitConfig.org
	    let repo = gitConfig.repo

	    const gitHubUrl = `https://${userName}:${password}@github.com/${org}/${repo}`;

		await simpleGit.cwd({ path: '/tmp/profiles/', root: true });

		await simpleGit.init()

		await simpleGit.addRemote('origin',gitHubUrl);


		await simpleGit.addConfig('user.email','ndmso@loc.gov');
		await simpleGit.addConfig('user.name','NDMSO');
		await simpleGit.pull('origin','main')
		await simpleGit.checkout('main')


	    // write out the file

		fs.writeFileSync( `/tmp/profiles/${docName}-${env}/data.json` , JSON.stringify(jsonPayload,null,2))

	    if (docName == 'profile' && jsonPayload){

	    	for (let p of jsonPayload){
	    		if (p.json && p.json.Profile){
	    			fs.writeFileSync( `/tmp/profiles/${docName}-${env}/src/${p.json.Profile.id}.json` , JSON.stringify(p.json.Profile,null,2))
	    		}


	    		if (p.json && p.json.Profile && p.json.Profile.resourceTemplates){

	    			for (let rt of p.json.Profile.resourceTemplates ){
	    				// console.log('wrotomg ',rt.id)
						fs.writeFileSync( `/tmp/profiles/${docName}-${env}/src/${rt.id}.json` , JSON.stringify(rt,null,2))
	    			}
	    		}
	    	}
	    }


		simpleGit.add('.')
		.then(
			(addSuccess) => {
				// console.log(addSuccess);
				simpleGit.commit(`${docName}-${env} change`)
					.then(
						(successCommit) => {
							// console.log(successCommit);

							simpleGit.push('origin','main')
								.then((success) => {
								   console.log('repo successfully pushed');
								},(failed)=> {
							       console.log(failed);
								   console.log('repo push faileds');
							});

					}, (failed) => {
						console.log(failed);
						console.log('failed commmit');
				});
			}, (failedAdd) => {
			  console.log(failedAdd)
			  console.log('adding files failed');
		});
	}





}



app.get('/profiles/bootstrap', async (request, response) => {

    MongoClient.connect(uri, async function(err, db) {
        if (err) throw err;
        var dbo = db.db("bfe2");


		let config = JSON.parse(fs.readFileSync('util_config.json', 'utf8'));

		if (config.bootstrapLinks){

			let bootstrapResults = []
			for(let id in config.bootstrapLinks){

				var options = {
					headers: {
					    "user-agent": "MARVA EDITOR"
					 }
				};

		        // let r = await rp.get(options)
		        // r = JSON.parse(r)

				r = await got(config.bootstrapLinks[id], options).json();



				let doc = await dbo.collection('profiles').findOne({type: id})
				if (doc){
					dbo.collection('profiles').updateOne(
					    {'_id': new mongo.ObjectID(doc['_id'])},
					    { $set: {type:id, data:r} }
					);

				}else{
			        dbo.collection("profiles").insertOne({type:id, data:r},
			        function(err, result) {
			            if (err) {
			            	console.log(err)
			            }
			        });
				}

			}

			response.status(200).send("Updated from bootstrap source.");

		}else{

			response.status(500).send("The bootstrap links were not found");

		}




	});
});

app.get('/profiles/:doc', async (request, response) => {

    MongoClient.connect(uri, async function(err, db) {
        if (err) throw err;
        var dbo = db.db("bfe2");

        let env='prod'

    	if (request.headers.referer && request.headers.referer.toLowerCase().indexOf('profile-editor-stage')>-1){
    		env='stage'
    	}

        let docName = request.params.doc

        if (docName == 'index.resourceType:profile'){
        	docName = 'profile'
        }


		let id = `${docName}-${env}`



		let doc = await dbo.collection('profiles').findOne({type: id})
		if (doc){
			response.json(doc.data);
			db.close();
		}else{
			response.status(404).json(null);
		}
	});
});

app.put('/profiles/:doc', async (request, response) => {


    MongoClient.connect(uri, async function(err, db) {
        if (err) throw err;

        var dbo = db.db("bfe2");

		let docName = request.params.doc

		let env='prod'
		if (request.headers.referer.toLowerCase().indexOf('profile-editor-stage')>-1){
			env='stage'
		}

		let id = `${docName}-${env}`
		let doc = await dbo.collection('profiles').findOne({type: id})
		if (doc){
			// response.json(doc.data);
			// db.close();
			// post the update to the document
			dbo.collection('profiles').updateOne(
			    {'_id': new mongo.ObjectID(doc['_id'])},
			    { $set: {type:id, data:request.body} }
			);

			// and then find the main profile and update the part of it with the update part
			let profileId = `profile-${env}`
			let docMain = await dbo.collection('profiles').findOne({type: profileId})
			if (docMain){

				// find the id
				for (let x in docMain.data){

					if (docMain.data[x].id == docName){
						// console.log("updating")
						docMain.data[x] = request.body
						// console.log(docMain.data[x])
					}
				}
				// console.log("docMain.data")
				// console.log(docMain.data)

				dbo.collection('profiles').updateOne(
				    {'_id': new mongo.ObjectID(docMain['_id'])},
				    { $set: {type:profileId, data:docMain.data} }
				);

				await updateGit('profile',env,docMain.data)

				response.status(200).send("Updated :)")


			}else{
				response.status(500).send("Could not the main profile to update")
			}



		}else{

			// if it could not find the doc then they are creating a new one
			// insert the doc as new

			const doc = { type:id, data:request.body };
			const result = await dbo.collection('profiles').insertOne(doc);

			// and then find the main profile and update the part of it with the update part
			let profileId = `profile-${env}`
			let docMain = await dbo.collection('profiles').findOne({type: profileId})
			if (docMain){

				// add it to the data
				docMain.data.push(request.body)
				// find the id
				// console.log("docMain.data")
				// console.log(docMain.data)

				dbo.collection('profiles').updateOne(
				    {'_id': new mongo.ObjectID(docMain['_id'])},
				    { $set: {type:profileId, data:docMain.data} }
				);

				await updateGit('profile',env,docMain.data)

				response.status(200).send("Updated :)")

			}



		}

	});



});

app.delete('/profiles/:doc', async (request, response) => {

	if (BFORGMODE){
		response.status(403).send();
		return false
	}

    MongoClient.connect(uri, async function(err, db) {
        if (err) throw err;

        var dbo = db.db("bfe2");

		let docName = request.params.doc

		let env='prod'
		if (request.headers.referer.toLowerCase().indexOf('profile-editor-stage')>-1){
			env='stage'
		}

		let id = `${docName}-${env}`
		let doc = await dbo.collection('profiles').findOne({type: id})
		if (doc){

			// remove the piece of the profile
			dbo.collection('profiles').deleteOne({_id: new mongo.ObjectID(doc['_id']) });


			// and then find in the main profile and remove it
			let profileId = `profile-${env}`
			let docMain = await dbo.collection('profiles').findOne({type: profileId})
			if (docMain){

				// filter out the part we want removed
				docMain.data = docMain.data.filter((x)=>{ return (x.id != docName) })

				dbo.collection('profiles').updateOne(
				    {'_id': new mongo.ObjectID(docMain['_id'])},
				    { $set: {type:profileId, data:docMain.data} }
				);

				// do the git stuff
				await updateGit('profile',env,docMain.data)




			}else{
				response.status(500).send("Could not the main profile to update")
			}



		}else{
			response.status(500).send("Could not find that ID to update")
		}

	});



	return response.status(200).send("yeah :)")

});

// this is for the /util/ interface
app.get('/profiles/:doc/:env', async (request, response) => {

    MongoClient.connect(uri, async function(err, db) {
        if (err) throw err;
        var dbo = db.db("bfe2");


		let id = `${request.params.doc}-${request.params.env}`
		// console.log("id = ",id)
		let doc = await dbo.collection('profiles').findOne({type: id})
		if (doc){
			response.json(doc.data);
			db.close();
		}else{
			response.json(null);
		}
	});
});




// profile editor endpoints
app.post('/profiles/save/:doc/:env', async (request, response) => {


	let env = 'stage'
	let docName = 'profile'

	if (request.params.env && request.params.env == 'prod'){
		env = 'prod'
	}
	if (request.params.env && request.params.env != 'profile'){
		docName = request.params.doc
	}

	let id = `${docName}-${env}`

    MongoClient.connect(uri, async function(err, db) {
        if (err) throw err;
        var dbo = db.db("bfe2");


        // find the key to update
		let doc = await dbo.collection('profiles').findOne({type: id})
		if (doc){
			dbo.collection('profiles').updateOne(
			    {'_id': new mongo.ObjectID(doc['_id'])},
			    { $set: {type:id, data:request.body} }
			);

		}else{
	        dbo.collection("profiles").insertOne({type:id, data:request.body},
	        function(err, result) {
	            if (err) {
	            	console.log(err)
	            }

	        });
		}


		// we also populate the individual profiles from the main blob on inital load so do that
		if (docName === 'profile'){

			for (let p of request.body){
				let id_sub = `${p.id}-${env}`
				let doc = await dbo.collection('profiles').findOne({type: id_sub})
				if (doc){
					dbo.collection('profiles').updateOne(
					    {'_id': new mongo.ObjectID(doc['_id'])},
					    { $set: {type:id_sub, data:p} }
					);
				}else{
			        dbo.collection("profiles").insertOne({type:id_sub, data:p},
			        function(err, result) {
			            if (err) {
			            	console.log(err)
			            }
			        });
				}

			}



		}



		db.close();

		// dbo.collection('profiles').collectionName.remove( { } )
    });

    // do the git stuff
	await updateGit(docName,env,request.body)



    return response.status(200).send("yeah :)")
});



// this is for the /util/ interface
app.get('/whichrt', async (request, response) => {

	if (BFORGMODE){
		response.status(403).send();
		return false
	}

	let uri = request.query.uri


	if ( uri.indexOf('bibframe.example.org') > 0 ) {
	    response.status(404).send();
	} else {

		var options = {
			headers: {
				"user-agent": "MARVA EDITOR"
			 }
		};

		try{
			let r = await got(uri, options)
			response.status(200).send(r.body);

		}catch{
			response.status(500).send('Error fetching resource via whichrt.');
		}
	}
});


app.post('/marcpreview/:type', async (request, response) => {
	let type = request.params.type
	var rdfxml = request.body.rdfxml

	// write out the contents to a file
	let tmpfilename = crypto.createHash('md5').update(new Date().getTime().toString()).digest("hex")
	tmpfilename = `/tmp/${tmpfilename}.xml`
	fs.writeFileSync( tmpfilename , request.body.rdfxml)

	const xslts = fs.readdirSync('/app/lib/bibframe2marc/', {withFileTypes: true})
	.filter(item => !item.isDirectory())
	.map((item) => {

		return {
			fullPath: `/app/lib/bibframe2marc/${item.name}`,
			version: item.name.split('_')[1].split('.xsl')[0]
		}
	})

	let results = []
	let rawMarc
	for (let xslt of xslts){

		if (xslt.fullPath.toLowerCase().indexOf('.xsl') == -1){
			continue
		}
		let marcxml
		try{
			marcxml = await exec(`xsltproc ${xslt.fullPath} ${tmpfilename}`)
		}catch(err){
			marcxml = err.toString()
		}
		results.push({'version':xslt.version, results: marcxml})
	}


	for (let r of results){
		let marcRecord
		try{
			let x
			if (r.results){
				x = r.results
			}
			if (r.results.stdout){
				x = r.results.stdout
			}

			x = x.trim()
			x = x.replace('<?xml version="1.0" encoding="UTF-8"?>','')

			x = x.replace(/\s+xml:space="preserve">/g,'>')
			x = x.replace(/\s+xml:space="preserve"\s+/g,' ')
			// x = x.replace(/\s+xml:lang="en"\s+/g,' ')
			x = x.replace(/\s+xml:lang="[a-zA-Z-]*"[\s+>]/g,' ')     //match and remove all `xml:lang="..."` instances


			x = x.replace(/<marc:/g,'<')
			x = x.replace(/<\/marc:/g,'</')
			// console.log(x)

			const record = Marc.parse(x, 'marcxml');
			rawMarc = record
			marcRecord = Marc.format(record, 'Text')

		}catch(err){
			marcRecord = err.toString()
		}

		if (type == "html"){
			let formatted = marcRecordHtmlify(rawMarc)
			r.marcRecord = formatted
		} else {
			r.marcRecord = marcRecord.trim()
		}
	}

	response.set('Content-Type', 'application/json');
	response.status(200).json(results);

});

/**
 * Puts everything into HTML tags with classes to help style the output
 */
function marcRecordHtmlify(data){
	let formatedMarcRecord = ["<div class='marc record'>"]
	let leader = "<div class='marc leader'>" + data["leader"].replace( / /g, "&nbsp;" ) + "</div>"
	formatedMarcRecord.push(leader)
	let fields = data["fields"]
	for (let field of fields){
		let tag
		let value = null
		let indicators = null
		let subfields = []
		for (let el in field){
			if (el == 0){
				tag = field[el]
			} else if (field.length == 2){
				value = field[el]
			} else if(el == 1 && field.length > 2) {
				indicators = [field[el][0], field[el][1]]
			} else {
				if ((el % 2) == 0 && field.length > 2) {
					subfields.push([field[el], field[Number(el)+1]])
				}
			}
		}
		if (value){
			//Fields that are no "tag: value"
			tag = "<span class='marc tag tag-" + tag + "'>" + tag + "</span>"
			value = " <span class='marc value'>" + value + "</span>"
			formatedMarcRecord.push("<div class='marc field'>"+ tag + value + "</div>")
		} else {
			//fields with subfields
			subfields = subfields.map((subfield) => "<span class='marc subfield subfield-" + subfield[0] + "'><span class='marc subfield subfield-label'>$"+subfield[0] +"</span> <span class='marc subfield subfield-value'>" + subfield[1] +"</span></span>")
			indicators = "<span class='marc indicators'><span class='marc indicators indicator-1'>" + indicators[0] + "</span><span class='marc indicators indicator-2'>" + indicators[1] + "</span></span>"
			tag = "<span class='marc tag tag-" + tag + "'>" + tag + "</span>"
			formatedMarcRecord.push("<div class='marc field'>"+ tag + " " + indicators + " " + subfields.join(" ") + "</div>")
		}
	}
	formatedMarcRecord.push("</div>") //close the first tag

	return formatedMarcRecord.join("\r\n")

};

/** WORLD CAT FUNCTIONS
 * Get a token from WorldCat
 * The token is stored in an environmental variable along with when it expires.
 * The expiration date is checked, when it exists, against the current time
 * to decide if we can load the existing token, or need to ask for a new one.
 *
 * @returns {string} token from worldcat
 */
async function worldCatAuthToken(){
	//https://www.oclc.org/developer/api/keys/oauth.en.html
	//https://www.oclc.org/developer/develop/authentication/access-tokens/explicit-authorization-code.en.html
	//https://github.com/OCLC-Developer-Network/gists/blob/master/authentication/node/authCodeAuthExample.js
	const credentials = {
		client: {
		  id: WC_CLIENTID,
		  secret: WC_SECRET
		},
		auth: {
		  tokenHost: 'https://oauth.oclc.org',
		  tokenPath: '/token',
		}
	  };
	// console.log("credentials", credentials)
	const scopes = "WorldCatMetadataAPI wcapi:view_bib wcapi:view_brief_bib"; // refresh_token";
	const { ClientCredentials, ResourceOwnerPassword, AuthorizationCode } = require('simple-oauth2');
	const oauth2 = new ClientCredentials(credentials);
	const tokenConfig = {
		scope: scopes
	};

	async function getToken(){
		//Get the access token object for the client
		   try {
			   let httpOptions = {'Accept': 'application/json'};
			   let accessToken = await oauth2.getToken(tokenConfig, httpOptions);
			   console.log("Access Token: ", accessToken);
			   return accessToken
		   } catch (error) {
			   console.error("Error getting token: ", error);
			   return error;
		   }
   }

	// Before doing this, check if there is a token value and if it is still good
	let token
	const now = new Date()

	if (process.env.WC_EXPIRES && (Date.parse(process.env.WC_EXPIRES) - now > 1000)){
		// use the existing token
	} else {
		token = await getToken();
		console.log("New token: ", token)
		process.env.WC_TOKEN = token.token.access_token
		process.env.WC_EXPIRES = token.token.expires_at
	}

	return process.env.WC_TOKEN
};

/**
 *
 * @param {string} token Token for worldCat
 * @param {string} query The search term in form index: query, ex: `ti: huck finn` would be a a title search for "huck finn"
 * @param {string} itemType The type of iem
 * @param {string} offset Where the search starts off, for pagination
 * @param {string} limit How many results to return
 * @returns
 */
async function worldCatSearchApi(token, query, itemType, offset, limit){
	const URL = 'https://americas.discovery.api.oclc.org/worldcat/search/v2/brief-bibs'

	let queryParams = {}
	if (itemType == 'book'){
		queryParams = {
			q: query,
			itemSubType: 'book-printbook',
			offset: offset,
			limit: limit
		}
	} else if (itemType == 'ebook'){
		queryParams = {
			q: query,
			itemSubType: 'book-digital',
			offset: offset,
			limit: limit
		}
	} else {
		queryParams = {
			q: query,
			itemType: itemType,
			offset: offset,
			limit: limit
		}
	}

	try{
		const resp = await got(URL, {
			searchParams: queryParams,
			headers: {
				'Authorization': 'Bearer ' + token,
				'Accept': "application/json",
				'User-Agent': 'marva-backend/ndmso@loc.gov'
			}
		});

		const data = JSON.parse(resp.body)
		let resp_data = {
			status: {"status":"success"},
			results: data
		}

		return resp_data
	} catch(error){
		// console.error("Error: ", error)
		// console.error("Error: ", error.response.statusCode)
		// console.error("Error: ", error.response)

		let resp_data = {
			status: {"status":"error"},
			error: error
		}
		return resp_data
	}
};

async function worldCatMetadataApi(token, ocn){

	let cachedValue = wcMarcCache.get(ocn)
	if (typeof cachedValue != 'undefined'){
		let resp_data = {
			status: {"status":"success"},
			results: cachedValue.marc
		}
		return resp_data
	}

	const URL = 'https://metadata.api.oclc.org/worldcat/manage/bibs/' + ocn

	try{
		const resp = await got(URL, {
			headers: {
				'Authorization': 'Bearer ' + token,
				'Accept': "application/marcxml+xml",
				'User-Agent': 'marva-backend/ndmso@loc.gov'
			}
		});

		const data = resp.body
		let resp_data = {
			status: {"status":"success"},
			results: data
		}
		cache = wcMarcCache.set( ocn, {marc: data}, cacheTTL );
		return resp_data
	} catch(error){
		// console.error("Error: ", error)
		// console.error("Error: ", error.response.statusCode)
		// console.error("Error: ", error.response)

		let resp_data = {
			status: {"status":"error"},
			error: error
		}
		return resp_data
	}
};

/**
 * WorldCat
 */
app.post('/worldcat/search/', async (request, response) => {
	/**
	 * Search WorldCat to get a list of what they cataloger might want
	 * Search API `/bibs`
	 *
	 * ZProcessor only supports search on ISBN and title (left anchored or keyword)
	 *   This is in the query(?) as `ti:` = title, `bn:` = ISBN
	 *   Limit to 10 results
	 * Parameters:
	 * 	query
	 * 	index
	 * 	item types
	 * 	offest & limit
	 *
	 * list of indexes: https://help.oclc.org/Librarian_Toolbox/Searching_WorldCat_Indexes/Bibliographic_records/Bibliographic_record_indexes/Bibliographic_record_index_lists/Alphabetical_list_of_available_Connexion_bibliographic_record_indexes
	 *
	 * Return a list of results limited to 10?
	 */

	console.log("searcing worldcat")

	let wcQuery = request.body.query
	let wcIndex = request.body.index
	let wcType = request.body.type
	let wcOffset = request.body.offset
	let wcLimit = request.body.limit
	let marc = request.body.marc
	// /bibs has more details, but brief-bibs as cataloging information that might be useful

	const token = await worldCatAuthToken()

	let resp_data
	if (!marc){
		resp_data = await worldCatSearchApi(token, wcIndex + ": " + wcQuery, wcType, wcOffset, wcLimit)
		if (resp_data.results && resp_data.results.numberOfRecords> 0 ){
			for (let record of resp_data.results.briefRecords){
				marc_data = await worldCatMetadataApi(token, record.oclcNumber)

				const marc = Marc.parse(marc_data.results, 'marcxml');
				rawMarc = marc
				marcRecord = Marc.format(marc, 'Text')

				record.marcXML = rawMarc.as('marcxml')//marc_data.results
				record.marcRaw = rawMarc
				record.marcJSON = JSON.parse(rawMarc.as('mij'))
				record.marcHTML = marcRecordHtmlify(rawMarc)
				record.rawResult = marc_data.results
			}
		}
	} else {
		resp_data = await worldCatMetadataApi(token, ocn)
	}

	response.set('Content-Type', 'application/json');
	response.status(200).send(resp_data);



});

app.post('/copycat/upload/:location', async (request, response) => {
	/**
	 * MARC comes from Metadata API `/worldcat/search/bibs/{oclcNumber}`
	 *
	 */
	let location = request.params.location
	let endpoint = "/controllers/ingest/marc-bib.xqy"
	var url = ''
	if (location == 'prod'){
		url = "https://" + PRODUCTIONccURL.trim() + endpoint;
	} else {
		url = "https://" + STAGGINGccURL.trim() + endpoint;
	}


	var marcxml = request.body.marcxml;

	let postLogEntry = {
		'copyCatDate': new Date(),
		'copyCatEnv': 'production',
		'copyCatTo': url,
		'copyCatXML': request.body.marcxml,

	}


	try{
		const postResponse = await got.post(url, {
			body: marcxml,
			username:MLUSER,
			password:MLPASS,
			headers: {
				"Content-type": "application/xml",
				'user-agent': 'marva-backend'
			}

		});

		postLogEntry['copyCatStatus'] = 'success'
		postLogEntry['copyCatStatusCode'] = 200
		postLogEntry['copyCatBodyResponse'] = postResponse.body
		postLogEntry['copyCatName'] = request.body.name
		postLog.push(postLogEntry)
		if (postLogEntry.length>50){
			postLogEntry.shift()
		}
		let copyCatStatus = {"status":"published"}

		if (postResponse.statusCode != 201 && postResponse.statusCode != 204 ){
			copyCatStatus = {"status": "error","server": url, "message": postResponse.statusCode }
		}
		let postLocation = null
		if (postResponse.headers && postResponse.headers.location){
			postLocation=postResponse.headers.location
		}


		let resp_data = {
			name: request.body.name,
			// "url": resources + name,
			//"objid": data.objid,
			// "lccn": lccn,
			copyCatStat: copyCatStatus,
			postLocation:postLocation
		}

		response.set('Content-Type', 'application/json');
		response.status(200).send(resp_data);




	}catch(err){
		console.log("err: ", err)
		postLogEntry['postingStatus'] = 'error'
		postLogEntry['postingStatusCode'] =  err.response.statusCode
		postLogEntry['postingBodyResponse'] = err.response.body
		postLogEntry['postingBodyName'] = request.body.name
		postLogEntry['postingEid'] = request.body.eid

		postLog.push(postLogEntry)
		if (postLogEntry.length>50){
			postLogEntry.shift()
		}


		errString = JSON.stringify(err.response.body)
		let replace = `${MLUSER}|${MLPASS}`;
		let re = new RegExp(replace,"g");
		errString = errString.replace(re, ",'****')");
		errString = JSON.parse(errString)



		resp_data = {
				"name": request.body.name,
				"objid":  "objid",
				"publish": {"status": "error","server": url,"message": errString }
			}
		response.set('Content-Type', 'application/json');
		response.status(500).send(resp_data);


	}

});



app.get('/worldcat/relatedmeta/:isbn', async (request, response) => {

	if (!WC_CLIENTID || !WC_SECRET){
		let resp_data = {
			status: {"status":"error"},
			error: "WorldCat client ID and secret not set in environment variables.",
			results: {
				isbns: [],
				records: []
			}
		}
		response.set('Content-Type', 'application/json');
		response.status(500).send(resp_data);
		return
	}

	const token = await worldCatAuthToken()
	const URL = 'https://americas.discovery.api.oclc.org/worldcat/search/v2/brief-bibs'

	let queryParams = {}
	queryParams = {
		// q: "bn:1931499047",
		// q: "bn:9781685035709", // NO RESULTS
		q: "bn:" + request.params.isbn,
		// itemSubType: 'book-printbook',
		// offset: 0,
		// limit: 10
	}


	try{
		const resp = await got(URL, {
			searchParams: queryParams,
			headers: {
				'Authorization': 'Bearer ' + token,
				'Accept': "application/json",
				'User-Agent': 'marva-backend/ndmso@loc.gov'
			}
		});

		const data = JSON.parse(resp.body)
		let resp_data = {
			status: {"status":"success"},
			results: {
				isbns: [],
				records: []
			}
		}
		// console.log("data: ", data)
		if (data && data.numberOfRecords> 0 ){
			let isbns = []
			for (let record of data.briefRecords){
				// console.log("record: ", record)
				if (record.isbns && record.isbns.length > 0){
					for (let isbn of record.isbns){
						if (isbns.indexOf(isbn) == -1){
							isbns.push(isbn)
						}
					}
				}


				marc_data = await worldCatMetadataApi(token, record.oclcNumber)

				const marc = Marc.parse(marc_data.results, 'marcxml');
				rawMarc = marc
				marcRecord = Marc.format(marc, 'Text')

				// record.marcXML = rawMarc.as('marcxml')//marc_data.results
				// record.marcRaw = rawMarc
				record.marcJSON = JSON.parse(rawMarc.as('mij'))
				// record.marcHTML = marcRecordHtmlify(rawMarc)
				// record.rawResult = marc_data.results
				resp_data.results.records.push(record)


			}
			resp_data.results.isbns = isbns


		}

		response.set('Content-Type', 'application/json');
		response.status(200).send(resp_data);

		// return resp_data
	} catch(error){
		// console.error("Error: ", error)
		// console.error("Error: ", error.response.statusCode)
		// console.error("Error: ", error.response)

		console.error('Error Response Body:', error.response.body);

		let resp_data = {
			status: {"status":"error"},
			error: error
		}
		response.set('Content-Type', 'application/json');
		response.status(500).send(error.response.body);

		// return resp_data
	}








});

app.post('/related/works/contributor/', async (request, response) => {

	var uris = request.body.uris
	console.log("uris: ", uris)
	let results = {}

	if (uris){

		for (let uri of uris){
			let uriResult = fetch(`https://id.loc.gov/resources/works/relationships/contributorto/?label=${uri}&page=0`, {
			"headers": {
				"accept": "*/*",
				"accept-language": "en-US,en;q=0.9,ru;q=0.8",
				"cache-control": "no-cache",
				"content-type": "application/x-www-form-urlencoded; charset=UTF-8",
				"Referrer-Policy": "strict-origin-when-cross-origin"
			},
			"body": null,
			"method": "GET"
			});

			let uriResultJson;
			try {
				uriResultJson = await uriResult.then(res => res.json());
			} catch (error) {
				console.error("Error fetching or parsing JSON for URI:", uri, error);
				// Optionally, add the error or a placeholder to results
				// results.push({uri: uri, error: "Failed to fetch or parse"});
				continue; // Skip to the next URI if an error occurs
			}
			results[uri] = uriResultJson;

		}
	}






	response.set('Content-Type', 'application/json');
	response.status(200).json(results);

});


app.get('/lcap/sync/lccn/:lccn', async (request, response) => {
	if (!LCAP_SYNC) {
		return response.status(500).send("LCAP_SYNC environment variable not set.");
	}

	const url = LCAP_SYNC.replace('<LCCN>', request.params.lccn);

	try {
		const lcapResponse = await got(url).json();
		response.status(200).json(lcapResponse);
	} catch (error) {
		console.error("LCAP Sync Error:", error);
		const errorBody = error.response ? error.response.body : 'Error fetching from LCAP sync endpoint.';
		response.status(500).send(errorBody);
	}
});


// user Preferences
// Save the user's preference to MongoDB
app.post('/prefs/:user', async (request, response) => {
	let user = request.params.user
	let newPrefs = request.body
	let msg ="???"

	MongoClient.connect(uri, function(err, db) {
		if (err) throw err;
		var dbo = db.db("bfe2");
		dbo.collection('userPrefs').findOne({'user': user})
			.then( (doc)=> {
				if (!doc){
					// need to add it to the db
					dbo.collection('userPrefs').insertOne(
						{ user: user, prefs: JSON.stringify(newPrefs)},
						function(err, result){
							if (err){
								msg = "Error inserting preferences: " + err
								response.status(500).json({'msg': msg});
							} else {
								msg = "Success!" + result
								response.status(200).json({'msg': msg});
							}
						}
					)
				} else {
					// need to update db
					dbo.collection('userPrefs').updateOne(
						{'_id': new mongo.ObjectID(doc['_id'])},
						{ $set: {prefs: JSON.stringify(newPrefs)}}
					)

					response.status(200).json({'msg': 'updated'});
				}
			})
	});
});


// Get the user's preference from MongoDB
app.get('/prefs/:user', (request, response) => {
	let user = request.params.user

	MongoClient.connect(uri, function(err, db) {
		if (err) throw err;
		var dbo = db.db("bfe2");
		dbo.collection('userPrefs').findOne({'user': user})
			.then( (doc)=> {
				try {
					let prefs = JSON.parse(doc.prefs)
					response.status(200).json({'result': prefs});
				} catch(err) {
					let msg = "Failed to load records: " + err
					response.status(500).json({'result': msg});
				}
			}
			)
	});
})

async function getStatus(){
	console.log("GET STATUS")

	// Get status information from ID/BFDB
	let baseURL = "https://preprod-8080.id.loc.gov/authorities/<DATASET>/activitystreams/feed/1.json"

	// Get the last update for Names & Subjects
	let subjectResults = await fetch(baseURL.replace("<DATASET>", "subjects"), {
		"headers": {
			"accept": "application/json",
			"cache-control": "no-cache",
		},
		"method": "GET"
	})

	let nameResults = await fetch(baseURL.replace("<DATASET>", "names"), {
		"headers": {
			"accept": "application/json",
			"cache-control": "no-cache",
		},
		"method": "GET"
	})

	let names = await nameResults.json()
	let mostRecentName = names.orderedItems[0].object.id
	let mostRecentNameURL = mostRecentName.replace("id.loc.gov", "preprod-8080.id.loc.gov") + ".marcxml.xml"

	let recentName = await fetch(mostRecentNameURL, {
		"headers": {
			"accept": "application/xml",
			"cache-control": "no-cache",
		},
		"method": "GET"
	})

	let subjects = await subjectResults.json()
	let recentNameXML = await recentName.text()

	// The Names can be updated more often than once a day, so we'll check the 005 for the most recent record to get the
	const pattern = /tag="005">(?<date>.*)<\//
	let match = recentNameXML.match(pattern)

	let date = match.groups.date
	if (date.endsWith(".0")){
		date = date.slice(0, -2)
	}

	let recentDateTime = new Date(date.replace(
		/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)$/,
		'$4:$5:$6 $2/$3/$1'
	));
	let subjectDate = new Date(subjects.orderedItems[0].object.updated.replace(
        /^(\d{4})(\d\d)(\d\d)$/,
        '$2/$3/$1'
    ))

	lastUpdateNames = recentDateTime.toLocaleString()
	lastUpdateSubjects = subjectDate.toLocaleDateString()

	// repeat 5 minutes this so the data is current.
	setTimeout(getStatus, 5*60*1000)
}


app.get('/status', (request, response) => {
	// Send the status information
	let updates = {'lastUpdateNames': lastUpdateNames, 'lastUpdateSubjects': lastUpdateSubjects}

	try {
		response.status(200).json({'status': {"updates": updates}});
	} catch(err) {
		let msg = "Failed to get status: " + err
		response.status(500).json({'result': msg});
	}
});

app.get('/history/:bibid', async (request, response) => {
	// Send the status information
	let base = RECORD_HISTORY.trim()
	let url = "https://" + base + '/metastory/api/history/bib?bibid=' + request.params.bibid + '&serialization=jsonld'

	const resp = await fetch(url, {
		headers: {
			"Content-type": "application/xml",
			'user-agent': 'marva-backend'
		}
	});

	if (resp.status == 500){
		response.status(500).json({'error': 'Failed to fetch history'});
		return
	}

	let history = await resp.text()

	try {
		response.status(200).json({'history': history});
	} catch(err) {
		let msg = "Failed to get status: " + err
		response.status(500).json({'result': msg});
	}
});

// Call getStatus
// getStatus()








console.log('listending on 5200')
app.listen(5200);
