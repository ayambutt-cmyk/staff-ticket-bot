require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, EmbedBuilder } = require('discord.js');
const cfg = require('./config');
const store = require('./store');
const tickets = require('./tickets');
const { colors, eph, getChannel } = require('./util');

if (!process.env.TOKEN) {
  console.error('no TOKEN in .env, copy .env.example to .env and fill it in');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // privileged: needed for the welcome message
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // privileged: needed for the . commands
  ],
});

// every file in /commands can export one command or an array of them
const commands = new Collection();
for (const file of fs.readdirSync(path.join(__dirname, 'commands')).filter((f) => f.endsWith('.js'))) {
  for (const cmd of [].concat(require(`./commands/${file}`))) commands.set(cmd.data.name, cmd);
}

client.once('ready', async () => {
  const body = commands.map((c) => c.data.toJSON());
  try {
    if (process.env.GUILD_ID) {
      const guild = await client.guilds.fetch(process.env.GUILD_ID);
      await guild.commands.set(body);
    } else {
      await client.application.commands.set(body);
    }
  } catch (err) {
    console.error('failed to register commands:', err.message);
  }

  // heads up about stuff left blank in config.js
  const blanks = [
    !cfg.roles.founder && 'roles.founder',
    !cfg.channels.mgmtTickets && 'channels.mgmtTickets (using general category)',
    !cfg.channels.welcome && 'channels.welcome (using system channel)',
  ].filter(Boolean);
  if (blanks.length) console.warn('config not filled in:', blanks.join(', '));

  console.log(`up as ${client.user.tag}, ${commands.size} commands`);
});

client.on('interactionCreate', async (i) => {
  try {
    if (i.isChatInputCommand()) {
      const cmd = commands.get(i.commandName);
      if (cmd) await cmd.run(i);
    } else if (i.isStringSelectMenu() && i.customId === 'ticket_open') {
      await tickets.askSubject(i);
    } else if (i.isModalSubmit() && i.customId.startsWith('ticket_modal:')) {
      await tickets.create(i);
    } else if (i.isButton() && i.customId.startsWith('ticket_')) {
      await tickets.button(i);
    }
  } catch (err) {
    console.error(err);
    if (!i.isRepliable()) return;
    const msg = eph('something broke on my end, try again');
    if (i.deferred || i.replied) i.followUp(msg).catch(() => {});
    else i.reply(msg).catch(() => {});
  }
});

client.on('messageCreate', (msg) => {
  tickets.dot(msg).catch((err) => {
    console.error(err);
    msg.reply('something broke on my end').catch(() => {});
  });
});

// someone deleted a ticket channel by hand, drop it from the store
client.on('channelDelete', (ch) => store.deleteTicket(ch.id));

client.on('guildMemberAdd', async (member) => {
  const ch = (await getChannel(member.guild, cfg.channels.welcome)) || member.guild.systemChannel;
  if (!ch) return;

  const embed = new EmbedBuilder()
    .setColor(colors.purple)
    .setTitle(`Welcome to ${member.guild.name}!`)
    .setDescription(`Glad to have you here, ${member}. Read through the rules and open a ticket if you need anything.`)
    .setThumbnail(member.user.displayAvatarURL())
    .setFooter({ text: `Member #${member.guild.memberCount}` });

  ch.send({ content: `${member}`, embeds: [embed] }).catch(console.error);
});

// keep the bot alive if something slips through
process.on('unhandledRejection', (err) => console.error('unhandled rejection:', err));
process.on('uncaughtException', (err) => console.error('uncaught exception:', err));

client.login(process.env.TOKEN);
