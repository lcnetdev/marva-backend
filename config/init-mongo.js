// We don't need to create a user bc we are not using auth
// db.createUser(
//         {
//             user: "bfe2",
//             pwd: "bfe2",
//             roles: [
//                 {
//                     role: "readWrite",
//                     db: "bfe2"
//                 }
//             ]
//         }
// );

rs.initiate({_id: 'rs0', members: [{_id: 0, host: 'mongo:27017'}]})