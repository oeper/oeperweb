'use strict';
// Event handlers for a maker bot. They only touch the small part of the discord.js objects listed below (and plain-object
// embeds), so the tests can drive them with mocks and no Discord connection.
const L = require('./logic');

const EPHEMERAL = 64; // MessageFlags.Ephemeral
const NO_MENTIONS = { parse: [] };
const NUMBERS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];
const unix = d => Math.floor(new Date(d).getTime() / 1000);
const clip = (s, n) => String(s).slice(0, n);

function makeHandlers(cfg, { rnd = Math.random } = {}) {
  const ctxFor = (guild, user, channel) => ({
    user: user ? `<@${user.id}>` : '',
    username: user ? (user.displayName || user.username) : '',
    server: guild ? guild.name : '',
    channel: channel ? `<#${channel.id}>` : '',
    count: guild ? guild.memberCount : '',
  });

  async function sendLog(guild, text) {
    const id = cfg.moderation.logChannelId;
    if (!id || !guild) return;
    try { const ch = await guild.channels.fetch(id); if (ch && ch.send) await ch.send({ content: clip(text, 1900), allowedMentions: NO_MENTIONS }); } catch { /* log channel missing: not worth failing the command */ }
  }

  const say = (i, content, extra = {}) => i.reply({ content: clip(content, 2000), allowedMentions: NO_MENTIONS, ...extra });
  const hidden = (i, content) => say(i, content, { flags: EPHEMERAL });

  async function moderate(i, kind) {
    if (!i.guild) return hidden(i, 'This only works in a server.');
    const need = { kick: L.PERM.kick, ban: L.PERM.ban, timeout: L.PERM.timeout }[kind];
    if (!i.memberPermissions || !i.memberPermissions.has(BigInt(need))) return hidden(i, "You don't have permission to do that.");
    const user = i.options.getUser('user');
    const member = i.options.getMember('user');
    const reason = clip(i.options.getString('reason') || 'No reason given', 400);
    if (user.id === i.user.id) return hidden(i, "You can't do that to yourself.");
    if (user.id === i.client.user.id) return hidden(i, "Nice try, but I'm staying.");
    if (!member && kind !== 'ban') return hidden(i, "That person isn't in this server.");
    if (member) {
      const owner = i.guild.ownerId === i.user.id;
      if (!owner && i.member && i.member.roles && member.roles && i.member.roles.highest.comparePositionTo(member.roles.highest) <= 0) {
        return hidden(i, "You can't do that to someone with an equal or higher role.");
      }
      const ok = kind === 'kick' ? member.kickable : kind === 'ban' ? member.bannable : member.moderatable;
      if (!ok) return hidden(i, "I can't do that to this member. My role needs to be above theirs, with the right permission.");
    }
    let done;
    if (kind === 'kick') { await member.kick(`${i.user.tag}: ${reason}`); done = 'Kicked'; }
    else if (kind === 'ban') {
      const days = i.options.getInteger('delete_days') || 0;
      await i.guild.members.ban(user, { reason: `${i.user.tag}: ${reason}`, deleteMessageSeconds: days * 86400 });
      done = 'Banned';
    } else {
      const minutes = i.options.getInteger('minutes');
      await member.timeout(minutes * 60000, `${i.user.tag}: ${reason}`);
      done = `Timed out for ${minutes} minute${minutes === 1 ? '' : 's'}`;
    }
    await say(i, `${done} **${user.tag || user.username}**. ${reason}`);
    await sendLog(i.guild, `**${done}** ${user.tag || user.username} (${user.id}) by ${i.user.tag || i.user.username}. Reason: ${reason}`);
  }

  async function onCommand(i) {
    const name = i.commandName;
    switch (name) {
      case 'ping': return say(i, `Pong! ${Math.round((i.client.ws && i.client.ws.ping) || 0)}ms`);
      case 'help': {
        const lines = L.commandDefs(cfg).map(d => `**/${d.name}** ${d.description}`);
        return say(i, lines.join('\n') || 'No commands yet.', { flags: EPHEMERAL });
      }
      case 'avatar': {
        const u = i.options.getUser('user') || i.user;
        return say(i, u.displayAvatarURL({ size: 1024 }));
      }
      case 'userinfo': {
        const u = i.options.getUser('user') || i.user;
        const m = i.options.getMember('user') || (u.id === i.user.id ? i.member : null);
        const fields = [{ name: 'ID', value: u.id, inline: true }, { name: 'Account created', value: `<t:${unix(u.createdAt)}:R>`, inline: true }];
        if (m && m.joinedAt) fields.push({ name: 'Joined this server', value: `<t:${unix(m.joinedAt)}:R>`, inline: true });
        return say(i, '', { embeds: [{ title: u.tag || u.username, thumbnail: { url: u.displayAvatarURL({ size: 256 }) }, fields, color: 0x5865f2 }] });
      }
      case 'serverinfo': {
        const g = i.guild;
        if (!g) return hidden(i, 'This only works in a server.');
        return say(i, '', { embeds: [{ title: g.name, fields: [
          { name: 'Members', value: String(g.memberCount), inline: true },
          { name: 'Created', value: `<t:${unix(g.createdAt)}:R>`, inline: true },
          { name: 'Owner', value: `<@${g.ownerId}>`, inline: true }], color: 0x5865f2 }] });
      }
      case 'coinflip': return say(i, rnd() < 0.5 ? '🪙 Heads!' : '🪙 Tails!');
      case 'roll': {
        const sides = i.options.getInteger('sides') || 6;
        return say(i, `🎲 You rolled a **${L.rollDie(sides, rnd)}** (d${sides})`);
      }
      case '8ball': return say(i, `🎱 **${clip(i.options.getString('question'), 200)}**\n${L.pick(L.EIGHT_BALL, rnd)}`);
      case 'poll': {
        const opts = ['option1', 'option2', 'option3', 'option4'].map(k => i.options.getString(k)).filter(Boolean);
        const text = `📊 **${clip(i.options.getString('question'), 200)}**\n` + opts.map((o, n) => `${NUMBERS[n]} ${o}`).join('\n');
        const msg = await say(i, text, { fetchReply: true });
        for (let n = 0; n < opts.length; n++) { try { await msg.react(NUMBERS[n]); } catch { break; } }
        return;
      }
      case 'say': {
        if (!i.memberPermissions || !i.memberPermissions.has(BigInt(L.PERM.manageMessages))) return hidden(i, "You don't have permission to do that.");
        await i.channel.send({ content: clip(i.options.getString('text'), 2000), allowedMentions: NO_MENTIONS });
        return hidden(i, 'Sent.');
      }
      case 'kick': case 'ban': case 'timeout': return moderate(i, name);
      case 'purge': {
        if (!i.guild) return hidden(i, 'This only works in a server.');
        if (!i.memberPermissions || !i.memberPermissions.has(BigInt(L.PERM.manageMessages))) return hidden(i, "You don't have permission to do that.");
        const amount = i.options.getInteger('amount');
        const gone = await i.channel.bulkDelete(amount, true); // true: skip messages older than 14 days, Discord can't bulk delete those
        await hidden(i, `Deleted ${gone.size} message${gone.size === 1 ? '' : 's'}. (Messages older than 14 days can't be bulk deleted.)`);
        return sendLog(i.guild, `**Purged** ${gone.size} messages in <#${i.channel.id}> by ${i.user.tag || i.user.username}`);
      }
      default: {
        const c = cfg.commands.find(x => x.name === name);
        if (!c) return hidden(i, "I don't know that command (anymore).");
        return say(i, L.render(c.reply, ctxFor(i.guild, i.user, i.channel)), c.ephemeral ? { flags: EPHEMERAL } : {});
      }
    }
  }

  async function onMessage(m) {
    if (!cfg.autoReplies.length || m.author.bot || !m.content) return;
    const rule = L.matchAutoReply(cfg.autoReplies, m.content);
    if (!rule) return;
    await m.reply({ content: clip(L.render(rule.reply, ctxFor(m.guild, m.author, m.channel)), 2000), allowedMentions: { parse: [], repliedUser: false } });
  }

  async function postWelcome(member, text) {
    const g = member.guild;
    let ch = null;
    try { ch = cfg.welcome.channelId ? await g.channels.fetch(cfg.welcome.channelId) : g.systemChannel; } catch { ch = g.systemChannel; }
    if (!ch || !ch.send) return;
    await ch.send({ content: clip(L.render(text, ctxFor(g, member.user, ch)), 2000), allowedMentions: { users: [member.id], parse: [] } });
  }
  async function onMemberAdd(member) {
    if (cfg.autoRole.enabled && cfg.autoRole.roleId) { try { await member.roles.add(cfg.autoRole.roleId, 'Auto-role'); } catch (e) { console.error('[bot] could not give the auto-role (is my role above it, with Manage Roles?):', e.message); } }
    if (cfg.welcome.enabled) await postWelcome(member, cfg.welcome.message);
  }
  async function onMemberRemove(member) {
    if (cfg.welcome.leaveEnabled) await postWelcome(member, cfg.welcome.leaveMessage);
  }

  return { onCommand, onMessage, onMemberAdd, onMemberRemove };
}

module.exports = { makeHandlers };
