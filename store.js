// tiny json "database". fine for one server, swap for sqlite if it grows
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'data.json');
let db = null;

function load() {
  if (db) return db;
  try {
    db = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    db = {};
  }
  db.cases ??= 0;
  db.infractions ??= [];
  db.tickets ??= {};
  return db;
}

// write to a temp file first so a crash mid-write can't corrupt data.json
function save() {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, file);
}

// ---- infractions ----
function addInfraction({ userId, type, reason, by }) {
  const d = load();
  d.cases += 1;
  const row = { id: d.cases, userId, type, reason, by, at: Date.now(), revoked: false };
  d.infractions.push(row);
  save();
  return row;
}

const infractionsFor = (userId) => load().infractions.filter((x) => x.userId === userId);
const getInfraction = (id) => load().infractions.find((x) => x.id === id);

function revokeInfraction(id, by) {
  const row = getInfraction(id);
  if (!row || row.revoked) return null;
  row.revoked = true;
  row.revokedBy = by;
  row.revokedAt = Date.now();
  save();
  return row;
}

// ---- tickets (keyed by channel id) ----
function setTicket(channelId, data) {
  load().tickets[channelId] = { channelId, ...data };
  save();
}

const getTicket = (channelId) => load().tickets[channelId] || null;

function updateTicket(channelId, patch) {
  const t = getTicket(channelId);
  if (!t) return null;
  Object.assign(t, patch);
  save();
  return t;
}

function deleteTicket(channelId) {
  const d = load();
  if (d.tickets[channelId]) {
    delete d.tickets[channelId];
    save();
  }
}

const findTicketByOwner = (userId) => Object.values(load().tickets).find((t) => t.owner === userId) || null;

module.exports = {
  addInfraction,
  infractionsFor,
  getInfraction,
  revokeInfraction,
  setTicket,
  getTicket,
  updateTicket,
  deleteTicket,
  findTicketByOwner,
};
