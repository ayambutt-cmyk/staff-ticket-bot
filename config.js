// all the ids live here so you only edit one file
module.exports = {
  prefix: '.',

  roles: {
    staff: '1562590290978541640',      // can run /session, gets pinged for SSU requests + low
    directive: '1560624655662981275',  // directive tickets
    mgmtIA: '1564383647870746655',     // management + IA tickets
    support: '1564384591316516974',    // general support tickets
    founder: '',                       // TODO: founder role id
  },

  channels: {
    directiveTickets: '1560625169649897533', // category
    generalTickets: '1560625173059870751',   // category
    mgmtTickets: '',                         // TODO: category for mgmt/IA tickets (falls back to general)
    promotions: '1561307931729862686',
    infractions: '1561308032225386527',
    transcripts: '1565135732962500648',
    welcome: '',                             // TODO: welcome channel (falls back to the system channel)
  },

  // seconds before /session ssu-request and /session low can be used again
  sessionCooldown: 300,
};
