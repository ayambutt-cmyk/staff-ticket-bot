const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits: P,
} = require('discord.js');
const cfg = require('./config');
const store = require('./store');
const { colors, isTicketStaff, canManage, eph, getChannel, trim } = require('./util');

// escalation goes general -> management -> directive
const TYPES = {
  general: {
    label: 'General Support',
    role: cfg.roles.support,
    parent: cfg.channels.generalTickets,
    next: 'management',
  },
  management: {
    label: 'Management / IA',
    role: cfg.roles.mgmtIA,
    parent: cfg.channels.mgmtTickets || cfg.channels.generalTickets,
    next: 'directive',
  },
  directive: {
    label: 'Directive',
    role: cfg.roles.directive,
    parent: cfg.channels.directiveTickets,
    next: null,
  },
};

const MAX_TRANSCRIPT_MSGS = 5000;
const ALLOW = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks];

// ---------- panel ----------

function panelPayload() {
  const embed = new EmbedBuilder()
    .setTitle('Support Tickets')
    .setDescription('Pick the option that fits your issue and a private channel will open for you.')
    .setColor(colors.blue);

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_open')
    .setPlaceholder('What do you need help with?')
    .addOptions(
      { label: 'General Support', value: 'general', description: 'Questions and everyday help' },
      { label: 'Management / IA', value: 'management', description: 'Reports, staff issues, appeals' },
      { label: 'Directive', value: 'directive', description: 'High level matters only' },
    );

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}

function buttonRow(claimed = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim').setStyle(ButtonStyle.Success).setDisabled(claimed),
    new ButtonBuilder().setCustomId('ticket_close').setLabel('Close').setStyle(ButtonStyle.Danger),
  );
}

// returns the open ticket's channel for a user, cleaning up stale records on the way
function openTicketChannel(guild, userId) {
  const t = store.findTicketByOwner(userId);
  if (!t) return null;
  const ch = guild.channels.cache.get(t.channelId);
  if (ch) return ch;
  store.deleteTicket(t.channelId); // channel got deleted behind our back
  return null;
}

// ---------- opening ----------

// step 1: they picked a type from the dropdown, ask what's wrong
async function askSubject(i) {
  // reset the dropdown so the same option can be picked again later
  i.message.edit(panelPayload()).catch(() => {});

  const type = i.values[0];
  if (!TYPES[type]) return;

  const existing = openTicketChannel(i.guild, i.user.id);
  if (existing) return i.reply(eph(`you already have an open ticket: ${existing}`));

  const modal = new ModalBuilder()
    .setCustomId(`ticket_modal:${type}`)
    .setTitle(`${TYPES[type].label} ticket`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('subject')
          .setLabel('What do you need help with?')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(800)
          .setRequired(true),
      ),
    );

  await i.showModal(modal);
}

// step 2: modal submitted, make the channel
async function create(i) {
  const type = i.customId.split(':')[1];
  const def = TYPES[type];
  if (!def) return;

  const existing = openTicketChannel(i.guild, i.user.id);
  if (existing) return i.reply(eph(`you already have an open ticket: ${existing}`));

  await i.deferReply({ flags: MessageFlags.Ephemeral });

  const subject = i.fields.getTextInputValue('subject');
  const guild = i.guild;
  const clean = i.user.username.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';

  const handlers = [def.role, cfg.roles.founder].filter(Boolean);
  const ch = await guild.channels.create({
    name: `${type}-${clean}`.slice(0, 90),
    type: ChannelType.GuildText,
    parent: def.parent || null,
    topic: `${def.label} ticket for ${i.user.tag}`,
    permissionOverwrites: [
      { id: guild.id, deny: [P.ViewChannel] },
      { id: i.user.id, allow: ALLOW },
      ...handlers.map((id) => ({ id, allow: [...ALLOW, P.ManageMessages] })),
      { id: guild.members.me.id, allow: [...ALLOW, P.ManageChannels, P.ManageMessages] },
    ],
  });

  store.setTicket(ch.id, {
    owner: i.user.id,
    type,
    claimer: null,
    subject,
    openedAt: Date.now(),
  });

  const embed = new EmbedBuilder()
    .setColor(colors.blue)
    .setTitle(`${def.label} ticket`)
    .setDescription(`Hey ${i.user}, thanks for reaching out. Someone from the team will be with you shortly.`)
    .addFields({ name: 'What you told us', value: subject })
    .setFooter({ text: 'staff: .claim  .escalate  .add  .remove  .rename  .close' });

  await ch.send({
    content: `<@&${def.role}> ${i.user}`,
    embeds: [embed],
    components: [buttonRow()],
    allowedMentions: { roles: [def.role], users: [i.user.id] },
  });

  i.editReply(`ticket opened: ${ch}`);
}

// ---------- actions (each returns null on success or an error string) ----------

async function claim(channel, member) {
  const t = store.getTicket(channel.id);
  if (!t) return "this isn't a ticket";
  if (t.claimer === member.id) return 'you already claimed this one';
  if (t.claimer) return `already claimed by <@${t.claimer}>`;

  store.updateTicket(channel.id, { claimer: member.id });
  await channel.send({
    embeds: [new EmbedBuilder().setColor(colors.green).setDescription(`${member} claimed this ticket.`)],
  });
  return null;
}

async function unclaim(channel, member) {
  const t = store.getTicket(channel.id);
  if (!t) return "this isn't a ticket";
  if (!t.claimer) return "nobody's claimed it";
  if (t.claimer !== member.id && !canManage(member)) return "it's not yours to unclaim";

  store.updateTicket(channel.id, { claimer: null });
  await channel.send({
    embeds: [new EmbedBuilder().setColor(colors.grey).setDescription(`${member} unclaimed this ticket.`)],
  });
  return null;
}

async function escalate(channel, member) {
  const t = store.getTicket(channel.id);
  if (!t) return "this isn't a ticket";

  const cur = TYPES[t.type];
  if (!cur.next) return "it's already at directive, nowhere higher to go";

  const next = TYPES[cur.next];
  await channel.permissionOverwrites.edit(next.role, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    ManageMessages: true,
  });
  if (next.parent) await channel.setParent(next.parent, { lockPermissions: false });

  // claim resets so the new team can pick it up
  store.updateTicket(channel.id, { type: cur.next, claimer: null });

  await channel.send({
    content: `<@&${next.role}>`,
    embeds: [
      new EmbedBuilder().setColor(colors.orange).setDescription(`${member} escalated this to **${next.label}**.`),
    ],
    allowedMentions: { roles: [next.role] },
  });
  return null;
}

async function rename(channel, raw) {
  const clean = raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '').slice(0, 90);
  if (!clean) return 'that name has nothing usable in it';
  await channel.setName(clean);
  return null;
}

async function addUser(channel, user) {
  await channel.permissionOverwrites.edit(user, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    AttachFiles: true,
  });
  await channel.send({ embeds: [new EmbedBuilder().setColor(colors.blue).setDescription(`${user} was added to the ticket.`)] });
  return null;
}

async function removeUser(channel, user) {
  const t = store.getTicket(channel.id);
  if (t && t.owner === user.id) return "can't remove the person who opened it";
  await channel.permissionOverwrites.delete(user);
  await channel.send({ embeds: [new EmbedBuilder().setColor(colors.grey).setDescription(`${user} was removed from the ticket.`)] });
  return null;
}

async function close(channel, closer, reason) {
  const t = store.getTicket(channel.id);
  if (!t || t.closing) return; // double clicks / already on its way out
  store.updateTicket(channel.id, { closing: true });

  let text = `Ticket closed by ${closer}. Saving the transcript, this channel goes away in a few seconds.`;
  if (reason) text += `\n**Reason:** ${trim(reason, 500)}`;
  await channel.send({ embeds: [new EmbedBuilder().setColor(colors.red).setDescription(text)] });

  await sendTranscript(channel, t, closer, reason).catch(console.error);

  store.deleteTicket(channel.id);
  setTimeout(() => channel.delete('ticket closed').catch(() => {}), 5000);
}

// ---------- transcript ----------

// pulls history 100 at a time, oldest first
async function grabMessages(channel) {
  const all = [];
  let before;
  while (all.length < MAX_TRANSCRIPT_MSGS) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (!batch.size) break;
    all.push(...batch.values());
    before = batch.last().id;
  }
  return all.reverse();
}

async function sendTranscript(channel, t, closer, reason) {
  const msgs = await grabMessages(channel);

  const lines = msgs.map((m) => {
    const when = m.createdAt.toISOString().replace('T', ' ').slice(0, 19);
    let line = `[${when}] ${m.author.tag}: ${m.content}`;
    for (const e of m.embeds) {
      const bits = [e.title, e.description].filter(Boolean).join(' - ');
      if (bits) line += `\n    [embed] ${bits.replace(/\n/g, ' ')}`;
    }
    for (const a of m.attachments.values()) line += `\n    [attachment] ${a.url}`;
    return line;
  });

  const def = TYPES[t.type];
  const header = [
    `Ticket: #${channel.name}`,
    `Type: ${def.label}`,
    `Opened by: ${t.owner}`,
    `Opened: ${new Date(t.openedAt).toISOString()}`,
    `Claimed by: ${t.claimer || 'nobody'}`,
    `Closed by: ${closer.tag}`,
    reason ? `Close reason: ${reason}` : null,
    `Messages: ${msgs.length}${msgs.length >= MAX_TRANSCRIPT_MSGS ? ' (hit the cap, older ones cut)' : ''}`,
    `Original issue: ${t.subject}`,
    '',
    '-'.repeat(40),
    '',
  ]
    .filter((x) => x !== null)
    .join('\n');

  const buf = Buffer.from(header + lines.join('\n'), 'utf8');
  const name = `${channel.name}.txt`;

  const embed = new EmbedBuilder()
    .setColor(colors.grey)
    .setTitle('Ticket Closed')
    .addFields(
      { name: 'Ticket', value: `#${channel.name}`, inline: true },
      { name: 'Type', value: def.label, inline: true },
      { name: 'Opened By', value: `<@${t.owner}>`, inline: true },
      { name: 'Claimed By', value: t.claimer ? `<@${t.claimer}>` : 'nobody', inline: true },
      { name: 'Closed By', value: `${closer}`, inline: true },
      { name: 'Messages', value: String(msgs.length), inline: true },
    )
    .setTimestamp();
  if (reason) embed.addFields({ name: 'Reason', value: trim(reason, 1000) });

  const logCh = await getChannel(channel.guild, cfg.channels.transcripts);
  if (logCh) await logCh.send({ embeds: [embed], files: [{ attachment: buf, name }] });

  // dm the opener (dms may be closed or they may have left)
  const owner = await channel.client.users.fetch(t.owner).catch(() => null);
  if (owner) {
    await owner
      .send({
        content: `Your ticket in **${channel.guild.name}** was closed. Transcript attached.`,
        files: [{ attachment: buf, name }],
      })
      .catch(() => {});
  }
}

// ---------- button + prefix command routing ----------

async function button(i) {
  const t = store.getTicket(i.channel.id);
  if (!t) return i.reply(eph("this isn't an active ticket"));

  if (i.customId === 'ticket_claim') {
    if (!isTicketStaff(i.member)) return i.reply(eph('staff only'));
    await i.deferUpdate();
    const err = await claim(i.channel, i.member);
    if (err) return i.followUp(eph(err));
    return i.editReply({ components: [buttonRow(true)] }).catch(() => {});
  }

  if (i.customId === 'ticket_close') {
    if (!isTicketStaff(i.member) && i.user.id !== t.owner) return i.reply(eph("you can't close this"));
    await i.deferUpdate();
    return close(i.channel, i.user, null);
  }
}

const DOT_COMMANDS = ['close', 'rename', 'claim', 'unclaim', 'escalate', 'add', 'remove'];

async function dot(msg) {
  if (msg.author.bot || !msg.guild || !msg.content.startsWith(cfg.prefix)) return;

  const [cmd, ...args] = msg.content.slice(cfg.prefix.length).trim().split(/\s+/);
  const name = (cmd || '').toLowerCase();
  if (!DOT_COMMANDS.includes(name)) return;

  const t = store.getTicket(msg.channel.id);
  if (!t) return; // not a ticket channel, ignore silently

  const staff = isTicketStaff(msg.member);

  // the opener can close their own ticket, everything else is staff only
  if (name === 'close') {
    if (!staff && msg.author.id !== t.owner) return;
    return close(msg.channel, msg.author, args.join(' ') || null);
  }

  if (!staff) return msg.reply("you can't use that here");

  let err = null;
  if (name === 'claim') err = await claim(msg.channel, msg.member);
  else if (name === 'unclaim') err = await unclaim(msg.channel, msg.member);
  else if (name === 'escalate') err = await escalate(msg.channel, msg.member);
  else if (name === 'rename') {
    if (!args.length) return msg.reply('usage: `.rename new-name`');
    err = await rename(msg.channel, args.join(' '));
  } else {
    // add / remove need a target, mention or raw id
    const target = msg.mentions.members.first() || (args[0] && (await msg.guild.members.fetch(args[0]).catch(() => null)));
    if (!target) return msg.reply(`usage: \`.${name} @user\``);
    err = name === 'add' ? await addUser(msg.channel, target) : await removeUser(msg.channel, target);
  }

  if (err) return msg.reply(err);
  if (name === 'rename') msg.react('✅').catch(() => {});
}

module.exports = { panelPayload, askSubject, create, button, dot };
