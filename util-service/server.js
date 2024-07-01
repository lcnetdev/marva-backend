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

var got

(async function () {
	got = await import('got');    
	got = got.got
})();


const { promisify } = require('util');
const exec = promisify(require('child_process').exec)

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


const uri = 'mongodb://mongo:27017/';
MongoClient.connect(uri, function(err, client) {

	console.log("err", err)
	console.log("client", client)

    const db = client.db('bfe2');


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
	 			}
 			}
 		})


    db.collection('resourcesStaging').watch().on('change', data => 
    {

        // get the doc
				db.collection('resourcesStaging').findOne({'_id':new mongo.ObjectID(data.documentKey['_id'])})
				.then(function(doc) {
        if(!doc)
            throw new Error('No record found.');

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
	 					if (!recsProdByUser[doc.index.user]){
	 						recsProdByUser[doc.index.user] = {}
	 					}
	 					recsProdByUser[doc.index.user][doc.index.eid] = doc.index				
	 					recsProdByUser[doc.index.user][doc.index.eid]._id = doc._id			
	 				}
	 			}
 			}
 		})


    db.collection('resourcesProduction').watch().on('change', data => 
    {

        // get the doc
				db.collection('resourcesProduction').findOne({'_id':new mongo.ObjectID(data.documentKey['_id'])})
				.then(function(doc) {
        if(!doc)
            throw new Error('No record found.');

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

		let resp_data = {
			name: request.body.name, 
			// "url": resources + name, 
			//"objid": data.objid, 
			// "lccn": lccn, 
			publish: postStatus
		}
		
		response.set('Content-Type', 'application/json');
		response.status(200).send(resp_data);




	}catch(err){


		postLogEntry['postingStatus'] = 'error'
		postLogEntry['postingStatusCode'] =  err.StatusCodeError
		postLogEntry['postingBodyResponse'] = err.response.body
		postLogEntry['postingBodyName'] = request.body.name
		postLogEntry['postingEid'] = request.body.eid
		
		postLog.push(postLogEntry)
		if (postLogEntry.length>50){
			postLogEntry.shift()
		}


		errString = JSON.stringify(err)
		let replace = `${MLUSER}|${MLPASS}`;
		let re = new RegExp(replace,"g");
		errString = errString.replace(re, ",'****')");
		err = JSON.parse(errString)



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
	console.log('posting to',url)


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

		let resp_data = {
			name: request.body.name, 
			// "url": resources + name, 
			//"objid": data.objid, 
			// "lccn": lccn, 
			publish: postStatus
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


app.get('/myrecords/production/:user', function(request, response){
	if (request.params.user){
		response.json(recsProdByUser[request.params.user]);
	}else{
		response.json({});	
	}
});


app.get('/allrecords/production', function(request, response){
	response.json(recsProdByEid);	
});


app.get('/logs/posts', function(request, response){
	response.json(postLog);	
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
	
	console.log(r_html)

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
	
	console.log(r_html)

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
	
	console.log(r_html)

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
	
	console.log(r_html)

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
	
	console.log(r_html)

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
	    				console.log('wrotomg ',rt.id)
						fs.writeFileSync( `/tmp/profiles/${docName}-${env}/src/${rt.id}.json` , JSON.stringify(rt,null,2))
	    			}
	    		}
	    	}
	    }


		simpleGit.add('.')
		.then(
			(addSuccess) => {
				console.log(addSuccess);
				simpleGit.commit(`${docName}-${env} change`)
					.then(
						(successCommit) => {
							console.log(successCommit);

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
						console.log("updating")
						docMain.data[x] = request.body
						console.log(docMain.data[x])
					}
				}
				console.log("docMain.data")
				console.log(docMain.data)

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
				console.log("docMain.data")
				console.log(docMain.data)

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
		console.log("id = ",id)
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


app.post('/marcpreview', async (request, response) => {


	var rdfxml = request.body.rdfxml; 

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
			x = x.replace(/<marc:/g,'<')
			x = x.replace(/<\/marc:/g,'</')
			
			const record = Marc.parse(x, 'marcxml');			
			marcRecord = Marc.format(record, 'Text')
			
		}catch(err){
			marcRecord = err.toString()
		}

		r.marcRecord = marcRecord.trim()
		

	}


	
	response.set('Content-Type', 'application/json');
	response.status(200).json(results);

});


console.log('listending on 5200')
app.listen(5200);