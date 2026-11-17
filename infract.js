const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const cfg = require('../config');
const store = require('../store');
const { colors, canManage, outranks, eph, getChannel, trim } = require('../util');

const TYPES = ['Notice', 'Warning', 'Strike', 'Suspension', 'Demotion', 'Termination'];

// these ones don't count toward the "too many infractions" warning
const SOFT = new Set(['Notice']);
const THRESHOLD = 3;

const activeCount = (userId) => store.infractionsFor(userId).filter((x) => !x.revoked && !SOFT.has(x.type)).length;

const stamp = (ms) => `<t:${Math.floor(ms / 1000)}:d>`;

const infract = {
  data: new SlashCommandBuilder()
    .setName('infract')
    .setDescription('Issue a staff infraction')
    .addUserOption((o) => o.setName('user').setDescription('who').setRequired(true))
    .addStringOption((o) =>
      o
        .setName('type')
        .setDescription('infraction type')
        .setRequired(true)
        .addChoices(...TYPES.map((t) => ({ name: t, value: t }))),
    )
    .addStringOption((o) => o.setName('reason').setDescription('why').setRequired(true).setMaxLength(1000)),

  async run(i) {
    if (!canManage(i.member)) return i.reply(eph("you can't issue infractions"));

    const user = i.options.getUser('user');
    if (user.bot) return i.reply(eph("can't infract a bot"));
    if (user.id === i.user.id) return i.reply(eph("you can't infract yourself"));

    // they might have left, only check rank if they're still here
    const member = await i.guild.members.fetch(user.id).catch(() => null);
    if (member && !outranks(i.member, member)) {
      return i.reply(eph('their top role is equal to or above yours'));
    }

    const type = i.options.getString('type');
    const reason = i.options.getString('reason');

    await i.deferReply({ flags: MessageFlags.Ephemeral });

    const row = store.addInfraction({ userId: user.id, type, reason, by: i.user.id });
    const active = activeCount(user.id);

    const embed = new EmbedBuilder()
      .setColor(colors.red)
      .setTitle(`Infraction #${row.id}`)
      .addFields(
        { name: 'Member', value: `${user}`, inline: true },
        { name: 'Type', value: type, inline: true },
        { name: 'Issued By', value: `${i.user}`, inline: true },
        { name: 'Reason', value: reason },
        { name: 'Active Infractions', value: String(active), inline: true },
      )
      .setTimestamp();

    const ch = await getChannel(i.guild, cfg.channels.infractions);
    if (ch) await ch.send({ content: `${user}`, embeds: [embed] }).catch(console.error);

    const dmOk = await user.send({ embeds: [embed] }).then(() => true).catch(() => false);

    let msg = `logged infraction #${row.id} for ${user.username}${dmOk ? '' : " (couldn't dm them)"}`;
    if (active >= THRESHOLD) msg += `\n⚠️ that's ${active} active infractions, might be time to escalate this.`;
    i.editReply(msg);
  },
};

const infractions = {
  data: new SlashCommandBuilder()
    .setName('infractions')
    .setDescription("See someone's infraction history")
    .addUserOption((o) => o.setName('user').setDescription('who (leave blank for yourself)')),

  async run(i) {
    const user = i.options.getUser('user') || i.user;
    // anyone can look at their own, only managers can look at others
    if (user.id !== i.user.id && !canManage(i.member)) {
      return i.reply(eph("you can only view your own"));
    }

    const rows = store.infractionsFor(user.id);
    if (!rows.length) return i.reply(eph(`${user.username} has a clean record`));

    const shown = rows.slice(-10).reverse(); // newest first
    const lines = shown.map((r) => {
      const tag = r.revoked ? '~~' : '';
      return `${tag}**#${r.id}** · ${r.type} · ${stamp(r.at)}${tag}\n${tag}${trim(r.reason, 150)}${tag}${r.revoked ? ' *(revoked)*' : ''}`;
    });

    const embed = new EmbedBuilder()
      .setColor(colors.orange)
      .setTitle(`Infractions for ${user.username}`)
      .setDescription(lines.join('\n\n'))
      .setFooter({ text: `${activeCount(user.id)} active · ${rows.length} total${rows.length > 10 ? ' · showing last 10' : ''}` });

    i.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};

const revoke = {
  data: new SlashCommandBuilder()
    .setName('revoke')
    .setDescription('Revoke an infraction')
    .addIntegerOption((o) => o.setName('case').setDescription('infraction number').setRequired(true).setMinValue(1))
    .addStringOption((o) => o.setName('reason').setDescription('why it is being revoked').setMaxLength(500)),

  async run(i) {
    if (!canManage(i.member)) return i.reply(eph("you can't revoke infractions"));

    const id = i.options.getInteger('case');
    const existing = store.getInfraction(id);
    if (!existing) return i.reply(eph(`no infraction #${id}`));
    if (existing.revoked) return i.reply(eph(`#${id} is already revoked`));

    store.revokeInfraction(id, i.user.id);

    const reason = i.options.getString('reason');
    const embed = new EmbedBuilder()
      .setColor(colors.grey)
      .setTitle(`Infraction #${id} Revoked`)
      .addFields(
        { name: 'Member', value: `<@${existing.userId}>`, inline: true },
        { name: 'Original Type', value: existing.type, inline: true },
        { name: 'Revoked By', value: `${i.user}`, inline: true },
      )
      .setTimestamp();
    if (reason) embed.addFields({ name: 'Reason', value: reason });

    const ch = await getChannel(i.guild, cfg.channels.infractions);
    if (ch) await ch.send({ embeds: [embed] }).catch(console.error);

    i.reply(eph(`revoked #${id}`));
  },
};

module.exports = [infract, infractions, revoke];
