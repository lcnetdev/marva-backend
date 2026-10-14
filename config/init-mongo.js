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

// NOTE: do not call rs.initiate() here. This script runs against the image's
// temporary init mongod, which is bound to 127.0.0.1 only, so a member host of
// 'mongo:27017' can never match it and the initiate fails with
// "No host described in new configuration ... maps to this node", killing the
// container on a fresh install. The healthcheck in docker-compose.yml initiates
// the replica set once the real mongod is up with --bind_ip_all.
