import { dbpool } from './pool';

const pool = dbpool();

export const inviteToParty = (pid = null, uid = null, gid = null) => {
  const error = { done: false, party: null, user: null };
  return new Promise(async resolve => {
    if (!pid || !uid || !gid) return resolve(error);
    const party = await partyByID(pid);
    if (!party || party.host_id !== uid) return resolve(error);
    const userToInvite = await userByID(gid);
    if (!userToInvite) return resolve(error);
    return pool.connect((err, client, done) => {
      if (err) return resolve(error);
      client.query(`INSERT INTO party_guests_pending(party_id, guest_id) VALUES(${pid}, ${gid})`, (err, result) => {
        done();
        if (err) return resolve(error);
        return resolve({
          done: true,
          party: party,
          user: userToInvite
        });
      });
    });
  });
};
export const createParty = ({
  hostID, invitedIDs, name,
  minPrice, maxPrice, address, type,
  start, end, minRating, limit
}) => {
  return new Promise(resolve => {
    return pool.connect((err, client, done) => {
      if (err) return resolve(null);
      client.query(`INSERT INTO parties(name, host_id, min_price, max_price, location, start_time, end_time, min_rating, type, invite_limit) VALUES('${name}', ${Number.parseInt(hostID)}, ${Number.parseInt(minPrice)}, ${Number.parseInt(maxPrice)}, '${address}', ${Number.parseFloat(start)}, ${Number.parseFloat(end)}, ${Number.parseFloat(minRating)}, ${Number.parseInt(type)}, ${Number.parseInt(limit)}) RETURNING *`, (err, result) => {
        if (err) return resolve(null);
        const party = result.rows[0];
        if (invitedIDs.length > 1) {
          const formatted = invitedIDs.map(id => `(${party.id}, ${id})`);
          client.query(`INSERT INTO party_guests_pending(party_id, guest_id) VALUES ${formatted.join(',')}`, (err, result) => {
            done();
            if (err) return resolve(null);
            return resolve(party);
          });
        } else {
          done();
          return resolve(party);
        }
      });
    });
  });
};

export const partyByID = (id = null) => {
  return new Promise(resolve => {
    if (!id) return resolve(null);
    return pool.connect((err, client, done) => {
      if (err) return resolve(null);
      client.query(`SELECT * FROM parties WHERE id = ${id}`, (err, result) => {
        done();
        if (err) return resolve(null);
        return resolve(result.rows[0]);
      });
    });
  });
};

export const fetchParties = (id = null, stime, etime, minamnt, maxamnt) => {
  return new Promise(resolve => {
    if (!id) return resolve(null);
    return pool.connect((err, client, done) => {
      if (err) return resolve(null);
      client.query(`SELECT * FROM parties WHERE id IN (SELECT party_id FROM party_guests WHERE guest_id = ${id}) OR type = 0`, (err, result) => {
        if (err) return resolve(null);
        const parties = result.rows;
        client.query(`SELECT guest_id FROM party_guests WHERE party_id IN (${parties.join(',')}) GROUP BY party_id`, (err, result) => {
          done();
          if(err) return resolve(null);
          let queriedParties = parties;
          if(stime) queriedParties = parties.filter(party => party.start_time >= stime);
          if(etime) queriedParties = queriedParties.filter(party => party.end_time <= etime);

          return resolve(result.rows);
        });
      });
    });
  });
};

export const suspendParty = (pid = null, uid = null) => {
  return new Promise(async resolve => {
    if (!pid || !uid) return resolve(null);
    const party = await partyByID(pid);
    if (uid !== party.host_id) return resolve(null);
    if (party.is_suspended) return resolve(true);
    return pool.connect((err, client, done) => {
      console.log(err);
      if (err) return resolve(null);
      client.query(`UPDATE parties SET is_suspended=True WHERE id=${pid}`, (err, result) => {
        console.log(err);
        if (err) return resolve(null);
        return resolve(true);
      });
    });
  });
};

export const modifyParty = (pid = null, uid = null, data = null) => {
  return new Promise(async resolve => {
    if (!pid || !uid || !data) return resolve(null);
    const party = await partyByID(pid);
    if (uid !== party.host_id) return resolve(null);
    return pool.connect((err, client, done) => {
      if (err) return resolve(null);
      client.query(`UPDATE parties SET ${fields} WHERE id = ${pid} RETURNING *`, (err, result) => {
        if (err) return resolve(null);
        return resolve(result.rows[0]);
      });
    });
  });
};

export const joinParty = (pid = null, uid = null) => {
  return new Promise(async resolve => {
    if (!pid || !uid) return resolve(null);
    const party = await partyByID(pid);
    const user = await userByID(uid);
    if (party.type === -1 || party.min_rating > user.rating ) return resolve(null);
    return pool.connect((err, client, done) => {
      if (err) return resolve(null);
      client.query(`INSERT INTO party_guests VALUES (${pid}, ${uid})`, (err, result) => {
        if(err) return resolve(null);
        client.query(`DELETE FROM party_guests_pending WHERE guest_id = ${uid} AND party_id = ${pid}`, (err, result) => {
          done();
          if (err) return resolve(null);
          return resolve(true);
        });
      });
    });
  });
};

export const leaveParty = (pid = null, uid = null) => {
  return new Promise(resolve => {
    if (!pid || !uid) return resolve(null);
    return pool.connect((err, client, done) => {
      if (err) return resolve(null);
      client.query(`DELETE FROM party_guests WHERE party_id = ${pid} AND guest_id = ${uid}`, (err, result) => {
        if (err) return resolve(null);
        done();
        return resolve(true);
      });
    });
  });
};

export const declineInvitation = (pid = null, uid = null) => {
  return new Promise(resolve => {
    if (!pid || !uid) return resolve(null);
    return pool.connect((err, client, done) => {
      if (err) return resolve(null);
      client.query(`DELETE FROM party_guests_pending WHERE party_id = ${pid} AND guest_id = ${uid}`, (err, result) => {
        if (err) return resolve(null);
        done();
        return resolve(true);
      });
    });
  });
};