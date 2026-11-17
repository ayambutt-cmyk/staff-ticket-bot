# Staff + Ticket Bot

discord.js v14, Node 18.17+.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env`, put your bot token and server id in it
3. In the dev portal turn on **Server Members** and **Message Content** intents
4. Fill in the blanks in `config.js` (founder role, mgmt/IA ticket category, welcome channel)
5. `npm start`, then run `/ticketpanel` in the channel you want the panel in

The bot needs Manage Channels, Manage Roles, Send Messages, Embed Links, Attach Files, Read Message History. Keep its role above any rank you want `/promote` to hand out.

## Commands

| Command | Who | What |
|---|---|---|
| `/session ssu-request` `low` `startup` `ssd` | staff role + managers | session announcements (ping ones have a cooldown) |
| `/promote user rank reason [old_rank]` | mgmt/IA, directive, founder | gives the role, logs it, dms them |
| `/infract user type reason` | mgmt/IA, directive, founder | logs it with a case number, dms them |
| `/infractions [user]` | managers (anyone for their own) | history |
| `/revoke case [reason]` | managers | revoke an infraction |
| `/ticketpanel` | admin | posts the ticket dropdown |

Ticket commands (inside a ticket channel): `.claim` `.unclaim` `.escalate` `.rename name` `.add @user` `.remove @user` `.close [reason]`. Claim and Close buttons are on the first message too.

Closing saves a transcript to the transcripts channel and dms it to whoever opened the ticket.

## Files
- `config.js` ids and settings
- `store.js` json storage (`data.json`, auto created)
- `tickets.js` ticket logic
- `commands/` slash commands, drop a new file in and it loads
