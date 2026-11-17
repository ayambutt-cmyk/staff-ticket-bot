const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const cfg = require('../config');
const { colors, canManage, canGive, eph, getChannel, trim } = require('../util');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('promote')
    .setDescription('Promote a staff member')
    .addUserOption((o) => o.setName('user').setDescription('who').setRequired(true))
    .addRoleOption((o) => o.setName('rank').setDescription('their new rank').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('why').setRequired(true).setMaxLength(1000))
    .addRoleOption((o) => o.setName('old_rank').setDescription('rank to take off them (optional)')),

  async run(i) {
    if (!canManage(i.member)) return i.reply(eph("you can't promote people"));

    const target = await i.guild.members.fetch(i.options.getUser('user').id).catch(() => null);
    if (!target) return i.reply(eph("that person isn't in the server"));
    if (target.user.bot) return i.reply(eph("can't promote a bot"));
    if (target.id === i.user.id) return i.reply(eph("you can't promote yourself"));

    const rank = i.options.getRole('rank');
    const oldRank = i.options.getRole('old_rank');
    const reason = i.options.getString('reason');

    if (rank.managed || rank.id === i.guild.id) return i.reply(eph("that role can't be given out"));
    if (!canGive(i.member, rank)) return i.reply(eph("that rank is above your own highest role"));
    if (target.roles.cache.has(rank.id)) return i.reply(eph(`${target.user.username} already has ${rank.name}`));

    await i.deferReply({ flags: MessageFlags.Ephemeral });

    const audit = `Promoted by ${i.user.tag}: ${trim(reason, 100)}`;
    try {
      await target.roles.add(rank, audit);
      if (oldRank && target.roles.cache.has(oldRank.id)) await target.roles.remove(oldRank, audit);
    } catch {
      return i.editReply(`couldn't change their roles, make sure my role sits above ${rank.name}`);
    }

    const embed = new EmbedBuilder()
      .setColor(colors.green)
      .setTitle('Staff Promotion')
      .setThumbnail(target.user.displayAvatarURL())
      .addFields(
        { name: 'Member', value: `${target}`, inline: true },
        { name: 'New Rank', value: `${rank}`, inline: true },
        { name: 'Promoted By', value: `${i.user}`, inline: true },
        { name: 'Reason', value: reason },
      )
      .setTimestamp();
    if (oldRank) embed.spliceFields(2, 0, { name: 'Previous Rank', value: `${oldRank}`, inline: true });

    const ch = await getChannel(i.guild, cfg.channels.promotions);
    if (ch) await ch.send({ content: `${target}`, embeds: [embed] }).catch(console.error);

    const dmOk = await target.send({ embeds: [embed] }).then(() => true).catch(() => false);

    i.editReply(`promoted ${target.user.username} to ${rank.name}${dmOk ? '' : ' (couldn\'t dm them)'}`);
  },
};
