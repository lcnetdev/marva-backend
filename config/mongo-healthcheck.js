// Healthcheck for the mongo container (run via `mongosh --quiet --file`).
// Exits 0 only when this node is the PRIMARY of rs0 with its member addressed
// as localhost:27017, which is what the other host-network containers use.
//
//  - fresh data dir: initiates the replica set
//  - data dir created before network_mode: host (member host "mongo:27017"):
//    the node cannot find itself and sits in REMOVED state, so force-reconfig
//    the stored config to localhost:27017
var want = 'localhost:27017';

function isPrimary() {
  try { return rs.status().myState === 1; } catch (e) { return false; }
}

var stored = db.getSiblingDB('local').system.replset.findOne();

if (!stored) {
  rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: want }] });
} else if (stored.members.length !== 1 || stored.members[0].host !== want) {
  print('replica set member is ' + JSON.stringify(stored.members.map(m => m.host)) + ', re-pointing to ' + want);
  stored.members = [{ _id: 0, host: want }];
  stored.version += 1;
  rs.reconfig(stored, { force: true });
}

quit(isPrimary() ? 0 : 1);
