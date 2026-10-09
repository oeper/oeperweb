'use strict';
// Bot maker: the config format, its validation, and the pure helpers (templates, auto-reply matching, slash-command
// definitions). Used by the engine that runs inside every maker bot AND by dbhosting.js to check what the page saves,
// so a config that saves is a config the engine accepts. No discord.js in here, so it is easy to test.

const ID = /^\d{15,25}$/;
const CMD_NAME = /^[a-z0-9_-]{1,32}$/;
const MATCHES = ['contains', 'exact', 'starts', 'word'];
const LIMITS = { commands: 25, autoReplies: 50, reply: 1900, trigger: 100, description: 100 };

// What each built-in command is called and does (the page shows these descriptions).
const BUILTINS = {
  ping:       { name: 'ping',       label: 'ping',       text: 'Check that the bot is alive' },
  help:       { name: 'help',       label: 'help',       text: 'List everything the bot can do' },
  avatar:     { name: 'avatar',     label: 'avatar',     text: "Show someone's profile picture" },
  userinfo:   { name: 'userinfo',   label: 'userinfo',   text: 'Show info about a member' },
  serverinfo: { name: 'serverinfo', label: 'serverinfo', text: 'Show info about the server' },
  coinflip:   { name: 'coinflip',   label: 'coinflip',   text: 'Flip a coin' },
  roll:       { name: 'roll',       label: 'roll',       text: 'Roll a die (any number of sides)' },
  eightball:  { name: '8ball',      label: '8ball',      text: 'Ask the magic 8-ball a question' },
  poll:       { name: 'poll',       label: 'poll',       text: 'Start a quick poll with up to 4 options' },
  say:        { name: 'say',        label: 'say',        text: 'Make the bot post a message (needs Manage Messages)' },
};
const MOD = {
  kick:    { name: 'kick',    text: 'Kick a member' },
  ban:     { name: 'ban',     text: 'Ban a member' },
  timeout: { name: 'timeout', text: 'Time a member out for a while' },
  purge:   { name: 'purge',   text: 'Delete the last few messages in a channel' },
};
// Discord permission bits (as strings, they are bigger than a safe integer)
const PERM = { kick: '2', ban: '4', manageMessages: '8192', timeout: '1099511627776', manageRoles: '268435456' };

const EIGHT_BALL = ['It is certain.', 'Without a doubt.', 'Yes, definitely.', 'Most likely.', 'Outlook good.', 'Signs point to yes.',
  'Reply hazy, try again.', 'Ask again later.', 'Better not tell you now.', 'Cannot predict now.',
  "Don't count on it.", 'My reply is no.', 'My sources say no.', 'Outlook not so good.', 'Very doubtful.'];

function defaults() {
  return {
    version: 1,
    applicationId: '',
    builtins: Object.fromEntries(Object.keys(BUILTINS).map(k => [k, k === 'ping' || k === 'help'])),
    commands: [],
    autoReplies: [],
    welcome: { enabled: false, channelId: '', message: 'Welcome {user} to {server}! You are member #{count}.', leaveEnabled: false, leaveMessage: '{username} left the server.' },
    autoRole: { enabled: false, roleId: '' },
    moderation: { kick: false, ban: false, timeout: false, purge: false, logChannelId: '' },
  };
}

const str = (v, max) => String(v == null ? '' : v).replace(/\r\n/g, '\n').slice(0, max);

// Strict: used when the page saves, and by the engine at start-up. Returns { config } or { error }.
function validate(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const c = defaults();
  const bad = error => ({ error });

  const appId = str(r.applicationId, 40).trim();
  if (appId) { if (!ID.test(appId)) return bad('The application ID is the long number from the Discord developer portal (General Information).'); c.applicationId = appId; }

  if (r.builtins && typeof r.builtins === 'object') for (const k of Object.keys(c.builtins)) if (k in r.builtins) c.builtins[k] = !!r.builtins[k];

  const mod = r.moderation && typeof r.moderation === 'object' ? r.moderation : {};
  for (const k of Object.keys(MOD)) c.moderation[k] = !!mod[k];
  const logId = str(mod.logChannelId, 40).trim();
  if (logId) { if (!ID.test(logId)) return bad('The log channel ID must be the long number you get from "Copy Channel ID".'); c.moderation.logChannelId = logId; }

  const reserved = new Set();
  for (const [k, b] of Object.entries(BUILTINS)) if (c.builtins[k]) reserved.add(b.name);
  for (const [k, m] of Object.entries(MOD)) if (c.moderation[k]) reserved.add(m.name);

  const cmds = Array.isArray(r.commands) ? r.commands : [];
  if (cmds.length > LIMITS.commands) return bad(`At most ${LIMITS.commands} custom commands.`);
  const seen = new Set();
  for (const x of cmds) {
    if (!x || typeof x !== 'object') continue;
    const name = str(x.name, 40).trim().toLowerCase().replace(/^\/+/, '');
    const reply = str(x.reply, LIMITS.reply + 1).trim();
    if (!name && !reply) continue; // an untouched empty row
    if (!CMD_NAME.test(name)) return bad(`"/${name}" is not a valid command name. Use 1-32 lowercase letters, numbers, - or _ (no spaces).`);
    if (reserved.has(name)) return bad(`/${name} is already a built-in command. Pick another name.`);
    if (seen.has(name)) return bad(`You have two commands called /${name}.`);
    if (!reply) return bad(`/${name} needs a reply.`);
    if (reply.length > LIMITS.reply) return bad(`The reply for /${name} is too long (max ${LIMITS.reply} characters).`);
    seen.add(name);
    c.commands.push({ name, description: str(x.description, LIMITS.description).trim() || `Run /${name}`, reply, ephemeral: !!x.ephemeral });
  }

  const rules = Array.isArray(r.autoReplies) ? r.autoReplies : [];
  if (rules.length > LIMITS.autoReplies) return bad(`At most ${LIMITS.autoReplies} auto-replies.`);
  for (const x of rules) {
    if (!x || typeof x !== 'object') continue;
    const trigger = str(x.trigger, LIMITS.trigger + 1).trim();
    const reply = str(x.reply, LIMITS.reply + 1).trim();
    if (!trigger && !reply) continue;
    if (!trigger) return bad('An auto-reply needs a trigger word or phrase.');
    if (!reply) return bad(`The auto-reply for "${trigger}" needs a reply.`);
    if (trigger.length > LIMITS.trigger) return bad(`The trigger "${trigger.slice(0, 20)}…" is too long (max ${LIMITS.trigger} characters).`);
    if (reply.length > LIMITS.reply) return bad(`The reply for "${trigger}" is too long (max ${LIMITS.reply} characters).`);
    c.autoReplies.push({ match: MATCHES.includes(x.match) ? x.match : 'contains', trigger, reply, caseSensitive: !!x.caseSensitive });
  }

  const w = r.welcome && typeof r.welcome === 'object' ? r.welcome : {};
  c.welcome.enabled = !!w.enabled;
  c.welcome.leaveEnabled = !!w.leaveEnabled;
  const wch = str(w.channelId, 40).trim();
  if (wch) { if (!ID.test(wch)) return bad('The welcome channel ID must be the long number you get from "Copy Channel ID".'); c.welcome.channelId = wch; }
  if (w.message != null && str(w.message, 10).trim()) c.welcome.message = str(w.message, LIMITS.reply);
  if (w.leaveMessage != null && str(w.leaveMessage, 10).trim()) c.welcome.leaveMessage = str(w.leaveMessage, LIMITS.reply);

  const ar = r.autoRole && typeof r.autoRole === 'object' ? r.autoRole : {};
  const roleId = str(ar.roleId, 40).trim();
  if (roleId && !ID.test(roleId)) return bad('The role ID must be the long number you get from "Copy Role ID".');
  c.autoRole = { enabled: !!ar.enabled, roleId };
  if (c.autoRole.enabled && !roleId) return bad('Auto-role needs the role ID to give new members.');

  return { config: c };
}

// {user} {username} {server} {channel} {count}; unknown {words} are left as typed
function render(tpl, ctx) {
  return String(tpl == null ? '' : tpl).replace(/\{(\w+)\}/g, (m, k) => (ctx && Object.prototype.hasOwnProperty.call(ctx, k) ? String(ctx[k]) : m));
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function matchAutoReply(rules, text) {
  const raw = String(text || '');
  for (const rule of rules || []) {
    const t = rule.caseSensitive ? raw : raw.toLowerCase();
    const g = rule.caseSensitive ? rule.trigger : rule.trigger.toLowerCase();
    let hit = false;
    if (rule.match === 'exact') hit = t.trim() === g;
    else if (rule.match === 'starts') hit = t.startsWith(g);
    else if (rule.match === 'word') hit = new RegExp('(^|[^\\p{L}\\p{N}])' + escapeRe(g) + '($|[^\\p{L}\\p{N}])', 'u').test(t);
    else hit = t.includes(g);
    if (hit) return rule;
  }
  return null;
}

const rollDie = (sides, rnd = Math.random) => 1 + Math.floor(rnd() * sides);
const pick = (list, rnd = Math.random) => list[Math.floor(rnd() * list.length)];

// Slash commands in the shape Discord's API takes (plain JSON, no discord.js builders)
const T = { STRING: 3, INTEGER: 4, USER: 6 };
function commandDefs(cfg) {
  const guildOnly = { dm_permission: false };
  const user = (description = 'The member', required = true) => ({ type: T.USER, name: 'user', description, required });
  const reason = { type: T.STRING, name: 'reason', description: 'Why (shown in the audit log)', required: false, max_length: 400 };
  const defs = [];
  const b = cfg.builtins;
  if (b.ping) defs.push({ name: 'ping', description: BUILTINS.ping.text });
  if (b.help) defs.push({ name: 'help', description: BUILTINS.help.text });
  if (b.avatar) defs.push({ name: 'avatar', description: BUILTINS.avatar.text, options: [user("Whose picture (default: yours)", false)] });
  if (b.userinfo) defs.push({ name: 'userinfo', description: BUILTINS.userinfo.text, ...guildOnly, options: [user('Which member (default: you)', false)] });
  if (b.serverinfo) defs.push({ name: 'serverinfo', description: BUILTINS.serverinfo.text, ...guildOnly });
  if (b.coinflip) defs.push({ name: 'coinflip', description: BUILTINS.coinflip.text });
  if (b.roll) defs.push({ name: 'roll', description: BUILTINS.roll.text, options: [{ type: T.INTEGER, name: 'sides', description: 'Number of sides (default 6)', required: false, min_value: 2, max_value: 1000 }] });
  if (b.eightball) defs.push({ name: '8ball', description: BUILTINS.eightball.text, options: [{ type: T.STRING, name: 'question', description: 'Your question', required: true, max_length: 200 }] });
  if (b.poll) defs.push({ name: 'poll', description: BUILTINS.poll.text, ...guildOnly, options: [
    { type: T.STRING, name: 'question', description: 'What to ask', required: true, max_length: 200 },
    { type: T.STRING, name: 'option1', description: 'First option', required: true, max_length: 80 },
    { type: T.STRING, name: 'option2', description: 'Second option', required: true, max_length: 80 },
    { type: T.STRING, name: 'option3', description: 'Third option', required: false, max_length: 80 },
    { type: T.STRING, name: 'option4', description: 'Fourth option', required: false, max_length: 80 }] });
  if (b.say) defs.push({ name: 'say', description: BUILTINS.say.text, ...guildOnly, default_member_permissions: PERM.manageMessages,
    options: [{ type: T.STRING, name: 'text', description: 'What to say', required: true, max_length: 1900 }] });
  const m = cfg.moderation;
  if (m.kick) defs.push({ name: 'kick', description: MOD.kick.text, ...guildOnly, default_member_permissions: PERM.kick, options: [user(), reason] });
  if (m.ban) defs.push({ name: 'ban', description: MOD.ban.text, ...guildOnly, default_member_permissions: PERM.ban,
    options: [user(), reason, { type: T.INTEGER, name: 'delete_days', description: 'Also delete their messages from the last N days (0-7)', required: false, min_value: 0, max_value: 7 }] });
  if (m.timeout) defs.push({ name: 'timeout', description: MOD.timeout.text, ...guildOnly, default_member_permissions: PERM.timeout,
    options: [user(), { type: T.INTEGER, name: 'minutes', description: 'How long (1 to 40320 minutes)', required: true, min_value: 1, max_value: 40320 }, reason] });
  if (m.purge) defs.push({ name: 'purge', description: MOD.purge.text, ...guildOnly, default_member_permissions: PERM.manageMessages,
    options: [{ type: T.INTEGER, name: 'amount', description: 'How many messages (1-100)', required: true, min_value: 1, max_value: 100 }] });
  for (const c of cfg.commands) defs.push({ name: c.name, description: c.description });
  return defs;
}

// Starting points for the "new bot" picker. Each is a partial config that goes through validate().
const PRESETS = {
  blank:      { label: 'Blank', text: 'Just /ping and /help. Add what you want.', config: {} },
  welcome:    { label: 'Welcome bot', text: 'Greets new members and says goodbye, with /help and a /rules command.', config: {
    welcome: { enabled: true, leaveEnabled: true },
    commands: [{ name: 'rules', description: 'Show the server rules', reply: '**Server rules**\n1. Be kind and respectful.\n2. No spam or self-promotion.\n3. Keep chats on topic.\n4. Listen to the moderators.' }] } },
  moderation: { label: 'Moderation bot', text: '/kick, /ban, /timeout and /purge with permission checks.', config: { moderation: { kick: true, ban: true, timeout: true, purge: true } } },
  fun:        { label: 'Fun bot', text: '/coinflip, /roll, /8ball, /poll and /avatar.', config: { builtins: { coinflip: true, roll: true, eightball: true, poll: true, avatar: true } } },
  support:    { label: 'FAQ / support bot', text: 'Answers common questions with commands and by watching for key words.', config: {
    commands: [
      { name: 'faq', description: 'Frequently asked questions', reply: '**FAQ**\n- How do I join? Read #rules, then say hi!\n- Who do I ask for help? Mention a moderator.\n- Edit this text in the bot maker.' },
      { name: 'rules', description: 'Show the server rules', reply: '**Server rules**\n1. Be kind.\n2. No spam.\n3. Keep chats on topic.', ephemeral: true }],
    autoReplies: [
      { match: 'word', trigger: 'help', reply: 'Need a hand, {username}? Try /faq, or ask a moderator.' },
      { match: 'contains', trigger: 'how do i join', reply: 'Welcome! Read the rules with /rules, then introduce yourself.' }] } },
};
function presetConfig(name) {
  const p = PRESETS[name] || PRESETS.blank;
  const base = defaults();
  const merged = {
    ...base, ...p.config,
    builtins: { ...base.builtins, ...(p.config.builtins || {}) },
    welcome: { ...base.welcome, ...(p.config.welcome || {}) },
    moderation: { ...base.moderation, ...(p.config.moderation || {}) },
  };
  return validate(merged).config;
}

module.exports = { ID, CMD_NAME, MATCHES, LIMITS, BUILTINS, MOD, PERM, EIGHT_BALL, PRESETS, defaults, validate, render, matchAutoReply, rollDie, pick, commandDefs, presetConfig };
