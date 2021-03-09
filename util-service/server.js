const express = require('express');
const shell = require('shelljs')
const cors = require('cors')




const mongo = require('mongodb')
const MongoClient = mongo.MongoClient;

var recsStageByEid = {}
var recsProdByEid = {}

var recsStageByUser = {}
var recsProdByUser = {}



const uri = 'mongodb://mongo:27017/';
MongoClient.connect(uri, function(err, client) {

    const db = client.db('bfe2');


    // build an intial index
    console.log('yeeeeee')
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
 				console.log(doc.index)
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
          	console.log('--------------')
			      console.log(doc.index);//else case

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

app.use(express.json());

app.use(cors())
app.options('*', cors())


app.get('/', function(request, response){
  console.log(request.body);      // your JSON
   response.send(request.body);    // echo the result back
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