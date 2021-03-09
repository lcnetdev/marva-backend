//const dotenv = require('dotenv');
//dotenv.config();
var createIndexDoc = function(version) {
    return {};
};

var config = {
    
    mongodb: {
        conn: "mongodb://mongo:27017"    ,
        db: "bfe2",
        collection: "resourcesStaging"
    },
    
    context: {
        "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
        "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
        "ldp": "http://www.w3.org/ns/ldp#",
        "dcterms": "http://purl.org/dc/terms/",
        "bf": "http://id.loc.gov/ontologies/bibframe/",
        "bflc": "http://id.loc.gov/ontologies/bflc/",
        "madsrdf": "http://www.loc.gov/mads/rdf/v1#",
        "void": "http://rdfs.org/ns/void#",
        "foaf": "http://xmlns.com/foaf/0.1/",
    },
    
    indexes: [
        { key: { uri: 1 } },
        { key: { docuri: 1 } },
        { key: { created: -1 } },
        { key: { modified: -1 } },
        { key: { containedIn: 1 } },
    ],
    createIndexDoc: createIndexDoc,
    
    useConverter: "riot",
    converters: {
        riot: {
            //var TD = "/c/Users/kevinford/work/ldpenv/ldpjs/tmp/";
            TD: "/app/tmp/",
            //var JENA_HOME="/c/Users/kevinford/work/rectoenv/opt/jena"
            //var JENA_RIOT='/c/Users/kevinford/work/rectoenv/opt/jdk-14.0.2/bin/java.exe -Dlog4j.configurationFile="/c/Users/kevinford/work/rectoenv/opt/jena/log4j2.properties" -cp "/c/Users/kevinford/work/rectoenv/opt/jena/lib/*" riotcmd.riot'; 
            //var JAVA_HOME="/c/Users/kevinford/work/rectoenv/opt/jdk-14.0.2"
            JAVA_HOME: "/opt/java/openjdk",
            JENA_HOME: "/jena",
            JENA_RIOT: '/jena/bin/riot',
        }
    }

};

module.exports = config;