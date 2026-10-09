'use strict';
// The shared engine behind every "bot maker" bot. Each maker bot's index.js just requires this file; it reads
// bot.config.json from the bot's own folder (the current directory) and the token from DISCORD_TOKEN.
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Events } = require('discord.js');
const L = require('./logic');
const { makeHandlers } = require('./handlers');

const log = m => console.log('[bot] ' + m);
let client = null, dying = false;
function fatal(m) {
  if (dying) return; // closing the client can make the login promise report a second, less helpful error
  dying = true;
  console.error('[bot] ' + m);
  if (!client) process.exit(2); // start-up problem: nothing is open yet
  try { client.destroy(); } catch { /* already closed */ }
  setTimeout(() => process.exit(2), 100); // let the open connection close first
}

let raw;
try { raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'bot.config.json'), 'utf8')); }
catch (e) { fatal('bot.config.json is missing or is not valid JSON (' + e.message + '). Open the maker tab and save it again.'); }
const checked = L.validate(raw);
if (checked.error) fatal('bot.config.json needs a fix: ' + checked.error);
const cfg = checked.config;

const token = process.env.DISCORD_TOKEN;
if (!token) fatal('There is no bot token yet. Paste it in the maker tab (Token section), then press restart.');

// Only ask Discord for what the enabled features need. The two privileged ones must also be switched on for the bot in the
// Discord developer portal (Bot page), otherwise the login is refused: the error below says which.
const intents = [GatewayIntentBits.Guilds];
if (cfg.autoReplies.length) intents.push(GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent);
if (cfg.welcome.enabled || cfg.welcome.leaveEnabled || cfg.autoRole.enabled) intents.push(GatewayIntentBits.GuildMembers);

client = new Client({ intents, allowedMentions: { parse: [] } });
const h = makeHandlers(cfg);
const guard = (name, fn) => async (...a) => { try { await fn(...a); } catch (e) { console.error(`[bot] ${name} failed: ${e && e.message}`); } };

client.on(Events.InteractionCreate, async i => {
  if (!i.isChatInputCommand()) return;
  try { await h.onCommand(i); }
  catch (e) {
    console.error(`[bot] /${i.commandName} failed: ${e && e.message}`);
    const msg = { content: 'Something went wrong running that command.', flags: 64 };
    try { if (i.deferred || i.replied) await i.followUp(msg); else await i.reply(msg); } catch { /* the interaction expired */ }
  }
});
client.on(Events.MessageCreate, guard('auto-reply', h.onMessage));
client.on(Events.GuildMemberAdd, guard('welcome', h.onMemberAdd));
client.on(Events.GuildMemberRemove, guard('goodbye', h.onMemberRemove));
client.on(Events.Error, e => console.error('[bot] client error: ' + e.message));
process.on('unhandledRejection', e => console.error('[bot] unhandled: ' + (e && e.message || e)));

client.once(Events.ClientReady, async c => {
  log(`logged in as ${c.user.tag}`);
  try {
    const defs = L.commandDefs(cfg);
    await c.application.commands.set(defs);
    log(`registered ${defs.length} slash command${defs.length === 1 ? '' : 's'}`);
  } catch (e) { console.error('[bot] could not register slash commands: ' + e.message); }
});

log(`starting (${cfg.commands.length} custom command${cfg.commands.length === 1 ? '' : 's'}, ${cfg.autoReplies.length} auto-repl${cfg.autoReplies.length === 1 ? 'y' : 'ies'})`);
client.login(token).catch(e => {
  const m = String(e && e.message || e);
  if (/disallowed intents|privileged intent/i.test(m)) fatal('Discord refused the login: turn on the "Server Members Intent" and/or "Message Content Intent" for this bot in the Discord developer portal (Bot page), then restart.');
  if (/invalid token|TokenInvalid|An invalid token/i.test(m)) fatal('Discord says the bot token is not valid. Reset it in the developer portal, paste the new one in the maker tab, then restart.');
  fatal('Could not log in: ' + m);
});
