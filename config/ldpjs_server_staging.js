'esversion: 8';

const express = require('express');
const cors = require('cors')

// need to add "cors": "^2.8.5", to the package.json
// need to add         "fast-xml-parser": "^3.18.0",
const parser = require('fast-xml-parser');



const app = express();

app.use(cors())

const ldp = require("./index.js");



/******************************************/

var config = {
    createIndexDoc: function(version) {
        var index = {};
        
        console.log("The VERSION IS:",version)

        var jsonObj = parser.parse(version.content);
        
        console.log(jsonObj)


        if (jsonObj['rdf:RDF']){
            if (jsonObj['rdf:RDF']['void:DatasetDescription']){

                if (jsonObj['rdf:RDF']['void:DatasetDescription']['lclocal:rtsused']){
                    if (!Array.isArray(jsonObj['rdf:RDF']['void:DatasetDescription']['lclocal:rtsused'])){
                        jsonObj['rdf:RDF']['void:DatasetDescription']['lclocal:rtsused'] = [jsonObj['rdf:RDF']['void:DatasetDescription']['lclocal:rtsused']]
                    }
                    index.rstused = jsonObj['rdf:RDF']['void:DatasetDescription']['lclocal:rtsused']
                }

                if (jsonObj['rdf:RDF']['void:DatasetDescription']['lclocal:profiletypes']){
                    if (!Array.isArray(jsonObj['rdf:RDF']['void:DatasetDescription']['lclocal:profiletypes'])){
                        jsonObj['rdf:RDF']['void:DatasetDescription']['lclocal:profiletypes'] = [jsonObj['rdf:RDF']['void:DatasetDescription']['lclocal:profiletypes']]
                    }
                    index.profiletypes = jsonObj['rdf:RDF']['void:DatasetDescription']['lclocal:profiletypes']
                }

                if (jsonObj['rdf:RDF']['void:DatasetDescription']['lclocal:externalid']){
                    if (!Array.isArray(jsonObj['rdf:RDF']['void:DatasetDescription']['lclocal:externalid'])){
                        jsonObj['rdf:RDF']['void:DatasetDescription']['lclocal:externalid'] = [jsonObj['rdf:RDF']['void:DatasetDescription']['lclocal:externalid']]
                    }
                    index.externalid = jsonObj['rdf:RDF']['void:DatasetDescription']['lclocal:externalid']
                }



                if (jsonObj['rdf:RDF']['void:DatasetDescription']['lclocal:title']){
                    index.title = jsonObj['rdf:RDF']['void:DatasetDescription']['lclocal:title']
                }
                if (jsonObj['rdf:RDF']['void:DatasetDescription']['lclocal:contributor']){
                    index.contributor = jsonObj['rdf:RDF']['void:DatasetDescription']['lclocal:contributor']
                }


                if (jsonObj['rdf:RDF']['void:DatasetDescription']['lclocal:lccn']){
                    index.lccn = jsonObj['rdf:RDF']['void:DatasetDescription']['lclocal:lccn']
                }
                if (jsonObj['rdf:RDF']['void:DatasetDescription']['lclocal:user']){
                    index.user = jsonObj['rdf:RDF']['void:DatasetDescription']['lclocal:user']
                }
                if (jsonObj['rdf:RDF']['void:DatasetDescription']['lclocal:status']){
                    index.status = jsonObj['rdf:RDF']['void:DatasetDescription']['lclocal:status']
                }
                if (jsonObj['rdf:RDF']['void:DatasetDescription']['lclocal:eid']){
                    index.eid = jsonObj['rdf:RDF']['void:DatasetDescription']['lclocal:eid']
                }
                if (jsonObj['rdf:RDF']['void:DatasetDescription']['lclocal:typeid']){
                    index.typeid = jsonObj['rdf:RDF']['void:DatasetDescription']['lclocal:typeid']
                }

            }
        }

        var d = new Date();
        index.time = d.toJSON().slice(0,19).replace('T',':')
        index.timestamp = Math.floor(Date.now() / 1000)



        return index;


        // if (version.content.configType !== undefined) {
        //     // This is a 'config' thing.  A profile, probably.
        //     index.resourceType = version.content.configType;
        //     if (version.content.name !== undefined) {
        //         index.label = version.content.name;
        //     }
        // }
        
        // if (version.content.rdf) {
        //     // We have a verso resource.
        //     index.resourceType = "resource";
        //     if (version.content.profile !== undefined) {
        //         index.profile = version.content.profile;
        //     }
        //     var rdf = JSON.parse(version.content.rdf);
            
        // }
        
    }
};

ldp.setConfig(config);

/******************************************/

app.use('/ldp', ldp);

app.listen(5101);
console.log("Listening on port 5101");

module.exports = ldp;