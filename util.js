const { PermissionFlagsBits, MessageFlags } = require('discord.js');
const cfg = require('./config');

const colors = {
  blue: 0x2b6cb0,
  green: 0x38a169,
  red: 0xe53e3e,
  orange: 0xdd6b20,
  yellow: 0xd69e2e,
  grey: 0x718096,
  purple: 0x805ad5,
};

const hasAny = (member, ids) => ids.filter(Boolean).some((id) => member.roles.cache.has(id));
const isAdmin = (m) => m.permissions.has(PermissionFlagsBits.Administrator);

// IA / management / directive / founders
const managerRoles = () => [cfg.roles.mgmtIA, cfg.roles.directive, cfg.roles.founder];
const canManage = (m) => isAdmin(m) || hasAny(m, managerRoles());

const isSessionStaff = (m) => isAdmin(m) || hasAny(m, [cfg.roles.staff, ...managerRoles()]);

// anyone who can work a ticket
const isTicketStaff = (m) =>
  isAdmin(m) || hasAny(m, [cfg.roles.support, cfg.roles.mgmtIA, cfg.roles.directive, cfg.roles.founder]);

// can `actor` act on `target`? (server owner always can, otherwise they need a higher top role)
function outranks(actor, target) {
  if (actor.id === actor.guild.ownerId) return true;
  if (target.id === actor.guild.ownerId) return false;
  return actor.roles.highest.comparePositionTo(target.roles.highest) > 0;
}

// can `actor` hand out this role?
function canGive(actor, role) {
  if (actor.id === actor.guild.ownerId || isAdmin(actor)) return true;
  return role.comparePositionTo(actor.roles.highest) < 0;
}

function trim(str, max) {
  str = String(str);
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

// shorthand for ephemeral replies
const eph = (content) => ({ content, flags: MessageFlags.Ephemeral });

// fetch a channel by id without blowing up if it's blank or deleted
async function getChannel(guild, id) {
  if (!id) return null;
  return guild.channels.fetch(id).catch(() => null);
}

module.exports = {
  colors,
  hasAny,
  isAdmin,
  canManage,
  isSessionStaff,
  isTicketStaff,
  outranks,
  canGive,
  trim,
  eph,
  getChannel,
};
