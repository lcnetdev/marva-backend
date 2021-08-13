const express = require('express');
const shell = require('shelljs')
const cors = require('cors')
const rp = require('request-promise');




const mongo = require('mongodb')
const MongoClient = mongo.MongoClient;

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

let editorVersion = {'major':0,'minor':0,'patch':0}

if (process.env.EDITORVERSION){

	let v = process.env.EDITORVERSION.split('.')

	editorVersion.major = parseInt(v[0])
	editorVersion.minor = parseInt(v[1])
	editorVersion.patch = parseInt(v[2])

}



const uri = 'mongodb://mongo:27017/';
MongoClient.connect(uri, function(err, client) {

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
 				if (doc.index.eid){
 					recsStageByEid[doc.index.eid] = doc.index
 				}
 				if (doc.index.user && doc.index.eid){
 					if (!recsStageByUser[doc.index.user]){
 						recsStageByUser[doc.index.user] = {}
 					}
 					recsStageByUser[doc.index.user][doc.index.eid] = doc.index				
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
		 				}

			      if (doc.index.user && doc.index.eid){
		 					if (!recsStageByUser[doc.index.user]){
		 						recsStageByUser[doc.index.user] = {}
		 					}
		 					recsStageByUser[doc.index.user][doc.index.eid] = doc.index
			      }




			  });


    });




    var cursor = db.collection('resourcesProduction').find({});

 		cursor.forEach((doc)=>{

 			if (doc.index){
 				if (doc.index.eid){
 					recsProdByEid[doc.index.eid] = doc.index
 				}
 				if (doc.index.user && doc.index.eid){
 					if (!recsProdByUser[doc.index.user]){
 						recsProdByUser[doc.index.user] = {}
 					}
 					recsProdByUser[doc.index.user][doc.index.eid] = doc.index				
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
		 				}

			      if (doc.index.user && doc.index.eid){
		 					if (!recsProdByUser[doc.index.user]){
		 						recsProdByUser[doc.index.user] = {}
		 					}
		 					recsProdByUser[doc.index.user][doc.index.eid] = doc.index
			      }




			  });


    });





});


 

var app = express();

app.use(express.json({limit: '15mb'}));

app.use(cors({origin:true}))

app.options('*', cors())


app.get('/', function(request, response){
  console.log(request.body);      // your JSON
   response.send(request.body);    // echo the result back
});

app.get('/version/editor', function(request, response){
  response.json(editorVersion);

});


app.get('/reports/stats/:year/:quarter', function(request, response){



	let correctlogin = 'yeet'
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
	}
	else{
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



// app.post('/publish/production', (request, response) => {

// 	// var shortuuid = require('short-uuid');
// 	// var decimaltranslator = shortuuid("0123456789");
// 	// var objid = req.body.objid;
// 	// var lccn = req.body.lccn;
// 	// var dirname = __dirname + resources;

// 	var name = request.body.name + ".rdf";
// 	var rdfxml = request.body.rdfxml; 

// 	var url = "https://" + PRODUCTIONPOSTURL.trim() + "/post/" + name;
// 	console.log('------')
// 	console.log(request.body.rdfxml)
// 	console.log('------')
// 	console.log('posting to',url)
// 	var options = {
// 	    method: 'POST',
// 	    uri: url,
// 	    body: rdfxml,
// 	    headers: { "Content-type": "application/xml" },
// 	    auth: {
// 	            'user': MLUSER,
// 	            'pass': MLPASS,
// 	        },
// 	    json: false // Takes JSON as string and converts to Object
// 	};
// 	rp(options)
// 	    .then(function (data) {
// 	        // {"name": "72a0a1b6-2eb8-4ee6-8bdf-cd89760d9f9a.rdf","objid": "/resources/instances/c0209952430001",
// 	        // "publish": {"status": "success","message": "posted"}}
// 	        console.log(data);
// 	        data = JSON.parse(data);
// 	        console.log(data.objid)
	        
// 	        var resp_data = {}
// 	        if (data.publish.status == "success") {
// 	            // IF successful, it is by definition in this case also posted.
// 	            resp_data = {
// 	                    "name": request.body.name, 
// 	                    // "url": resources + name, 
// 	                    "objid": data.objid, 
// 	                    // "lccn": lccn, 
// 	                    "publish": {"status":"published"}
// 	                }
// 	        } else {

// 	        	if (data.publish.message && data.publish.message.options && data.publish.message.options.auth){
// 	        		data.publish.message.options.auth = "PASSWORD and USER hidden in debug response"	
// 	        	}
// 	            resp_data = {
// 	                    "name": request.body.name, 
// 	                    "objid":  data.objid, 
// 	                    "publish": {"status": "error","server": url,"message": data.publish.message }
// 	                }
// 	        }
// 	        response.set('Content-Type', 'application/json');
// 	        response.status(200).send(resp_data);
// 	    })
// 	    .catch(function (err) {
// 	        // POST failed...
// 	        console.log(err)
// 	        resp_data = {
// 	                "name": request.body.name, 
// 	                "objid":  "objid", 
// 	                "publish": {"status": "error","server": url,"message": err }
// 	            }
// 	        response.set('Content-Type', 'application/json');
// 	        response.status(500).send(resp_data);
// 	    });


   
// });


app.post('/publish/production', (request, response) => {

	// var shortuuid = require('short-uuid');
	// var decimaltranslator = shortuuid("0123456789");
	// var objid = req.body.objid;
	// var lccn = req.body.lccn;
	// var dirname = __dirname + resources;

	var name = request.body.name + ".rdf";
	var rdfxml = request.body.rdfxml; 

	var url = "https://" + PRODUCTIONPOSTURL.trim() + "/controllers/ingest/bf-bib.xqy";
	console.log('------')
	console.log(request.body.rdfxml)
	console.log('------')
	console.log('posting to',url)
	var options = {
	    method: 'POST',
	    uri: url,
	    body: rdfxml,
	    resolveWithFullResponse: true,
	    headers: { "Content-type": "application/xml" },
	    auth: {
	            'user': MLUSER,
	            'pass': MLUSER,
	        },
	    json: false // Takes JSON as string and converts to Object
	};
	rp(options)
	    .then(function (postResponse) {
	        // {"name": "72a0a1b6-2eb8-4ee6-8bdf-cd89760d9f9a.rdf","objid": "/resources/instances/c0209952430001",
	        // "publish": {"status": "success","message": "posted"}}

	        console.log(postResponse)
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
	    })
	    .catch(function (err) {
	        // POST failed...
	        console.log(err)
	        resp_data = {
	                "name": request.body.name, 
	                "objid":  "objid", 
	                "publish": {"status": "error","server": url,"message": err }
	            }
	        response.set('Content-Type', 'application/json');
	        response.status(500).send(resp_data);
	    });


   
});



app.post('/publish/staging', (request, response) => {

	// var shortuuid = require('short-uuid');
	// var decimaltranslator = shortuuid("0123456789");
	// var objid = req.body.objid;
	// var lccn = req.body.lccn;
	// var dirname = __dirname + resources;

	var name = request.body.name + ".rdf";
	var rdfxml = request.body.rdfxml; 

	var url = "https://" + STAGINGPOSTURL.trim() + "/controllers/ingest/bf-bib.xqy";
	console.log('------')
	console.log(request.body.rdfxml)
	console.log('------')
	console.log('posting to',url)
	var options = {
	    method: 'POST',
	    uri: url,
	    body: rdfxml,
	    resolveWithFullResponse: true,
	    headers: { "Content-type": "application/xml" },
	    auth: {
	            'user': MLUSERSTAGE,
	            'pass': MLPASSSTAGE,
	        },
	    json: false // Takes JSON as string and converts to Object
	};
	rp(options)
	    .then(function (postResponse) {
	        // {"name": "72a0a1b6-2eb8-4ee6-8bdf-cd89760d9f9a.rdf","objid": "/resources/instances/c0209952430001",
	        // "publish": {"status": "success","message": "posted"}}

	        console.log(postResponse)
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
	    })
	    .catch(function (err) {
	        // POST failed...
	        console.log(err)
	        resp_data = {
	                "name": request.body.name, 
	                "objid":  "objid", 
	                "publish": {"status": "error","server": url,"message": err }
	            }
	        response.set('Content-Type', 'application/json');
	        response.status(500).send(resp_data);
	    });


   
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



app.get('/deploy-production', function(request, response){

	let correctlogin = 'yeet'
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


app.get('/deploy-staging', function(request, response){

	let correctlogin = 'yeet'
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


console.log('listending on 5200')
app.listen(5200);