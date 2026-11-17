const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const tickets = require('../tickets');
const { eph } = require('../util');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticketpanel')
    .setDescription('Post the ticket panel in this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async run(i) {
    await i.channel.send(tickets.panelPayload());
    i.reply(eph('panel posted'));
  },
};
