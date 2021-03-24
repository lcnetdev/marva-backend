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
const STAGINGPOSTURL = process.env.STAGINGPOSTURL;

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
		 			results.push({eId:doc.eId,desc:doc.desc,contact:doc.contact})
		 		}, function(err) {
			 		console.log(results)
			 		response.json(results)
				})


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

	var url = "https://" + STAGINGPOSTURL.trim() + "/post/" + name;
	console.log('posting to',url)
	var options = {
	    method: 'POST',
	    uri: url,
	    body: rdfxml,
	    headers: { "Content-type": "application/xml" },
	    auth: {
	            'user': MLUSER,
	            'pass': MLPASS,
	        },
	    json: false // Takes JSON as string and converts to Object
	};
	rp(options)
	    .then(function (data) {
	        // {"name": "72a0a1b6-2eb8-4ee6-8bdf-cd89760d9f9a.rdf","objid": "/resources/instances/c0209952430001",
	        // "publish": {"status": "success","message": "posted"}}
	        console.log(data);
	        data = JSON.parse(data);
	        console.log(data.objid)
	        
	        var resp_data = {}
	        if (data.publish.status == "success") {
	            // IF successful, it is by definition in this case also posted.
	            resp_data = {
	                    "name": request.body.name, 
	                    // "url": resources + name, 
	                    "objid": data.objid, 
	                    // "lccn": lccn, 
	                    "publish": {"status":"published"}
	                }
	        } else {
	            resp_data = {
	                    "name": request.body.name, 
	                    "objid":  data.objid, 
	                    "publish": {"status": "error","message": data.publish.message }
	                }
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
	                "publish": {"status": "error","message": err }
	            }
	        response.set('Content-Type', 'application/json');
	        response.status(500).send(resp_data);
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