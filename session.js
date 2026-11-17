const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const cfg = require('../config');
const { colors, isSessionStaff, eph } = require('../util');

// in memory only, resets if the bot restarts (that's fine for this)
const lastUsed = new Map(); // `${guild}:${sub}` -> timestamp
const running = new Map(); // guild -> { start, by }

function fmtDuration(ms) {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('session')
    .setDescription('Session commands')
    .addSubcommand((s) =>
      s
        .setName('ssu-request')
        .setDescription('Ask staff to hop on for an SSU')
        .addStringOption((o) => o.setName('note').setDescription('anything extra')),
    )
    .addSubcommand((s) =>
      s
        .setName('low')
        .setDescription('Session is running low')
        .addIntegerOption((o) => o.setName('players').setDescription('current player count').setMinValue(0)),
    )
    .addSubcommand((s) =>
      s
        .setName('startup')
        .setDescription('Start up a session')
        .addStringOption((o) => o.setName('code').setDescription('server join code'))
        .addStringOption((o) => o.setName('info').setDescription('extra info for players')),
    )
    .addSubcommand((s) => s.setName('ssd').setDescription('Shut the session down')),

  async run(i) {
    if (!isSessionStaff(i.member)) {
      return i.reply(eph('staff only'));
    }

    const sub = i.options.getSubcommand();
    const ping = `<@&${cfg.roles.staff}>`;

    // the two pinging ones get a cooldown so nobody spams the staff role
    if (sub === 'ssu-request' || sub === 'low') {
      const key = `${i.guildId}:${sub}`;
      const wait = cfg.sessionCooldown * 1000 - (Date.now() - (lastUsed.get(key) || 0));
      if (wait > 0) {
        return i.reply(eph(`slow down, try again in ${Math.ceil(wait / 1000)}s`));
      }
      lastUsed.set(key, Date.now());
    }

    const embed = new EmbedBuilder().setTimestamp().setFooter({ text: `by ${i.user.username}` });
    let content;

    if (sub === 'ssu-request') {
      content = ping;
      embed.setColor(colors.blue).setTitle('SSU Request').setDescription('We need staff online to start a server startup.');
      const note = i.options.getString('note');
      if (note) embed.addFields({ name: 'Note', value: note });
    }

    if (sub === 'low') {
      content = ping;
      embed.setColor(colors.yellow).setTitle('Session Low').setDescription('Player count is getting low, hop in if you can.');
      const n = i.options.getInteger('players');
      if (n !== null) embed.addFields({ name: 'Players', value: String(n), inline: true });
    }

    if (sub === 'startup') {
      running.set(i.guildId, { start: Date.now(), by: i.user.id });
      embed.setColor(colors.green).setTitle('Session Started').setDescription('The session is now live!');
      const code = i.options.getString('code');
      const info = i.options.getString('info');
      if (code) embed.addFields({ name: 'Join Code', value: `\`${code}\``, inline: true });
      if (info) embed.addFields({ name: 'Info', value: info });
    }

    if (sub === 'ssd') {
      embed.setColor(colors.red).setTitle('Session Shutdown').setDescription('The session has ended, thanks for joining.');
      const s = running.get(i.guildId);
      if (s) {
        embed.addFields({ name: 'Ran For', value: fmtDuration(Date.now() - s.start), inline: true });
        running.delete(i.guildId);
      }
    }

    await i.channel.send({ content, embeds: [embed], allowedMentions: { roles: [cfg.roles.staff] } });
    i.reply(eph('sent'));
  },
};
