'use strict';
// Preloaded into every hosted Node bot (NODE_OPTIONS=--require, set by dbhosting.js) so the status chosen on
// oeper.dev/dbhosting is applied without the bot's own code knowing about it.
//
// Discord presence is sent over the bot's own gateway connection, so the host cannot set it from outside. Instead this
// patches discord.js's Client#login (the same module instance the bot imports, CommonJS or ESM) and, once the client is
// ready, applies the status/activities from the JSON file named by DBHOSTING_PRESENCE_FILE. The file is watched, so a
// change on the page applies live; with several activities it rotates through them.
//
// It does nothing unless the settings say `enabled`, does nothing for npm/npx itself, and never throws into the bot.
const fs = require('fs');

const file = process.env.DBHOSTING_PRESENCE_FILE;
const ACT = { playing: 0, streaming: 1, listening: 2, watching: 3, custom: 4, competing: 5 };

function isNpm() {
  const a = String(process.argv[1] || '');
  return /[\\/](npm|npx)(-cli)?(\.js)?$/.test(a) || /node_modules[\\/]npm[\\/]/.test(a);
}

function readCfg() {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function startFor(client, djs) {
  if (client.__dbhosting) return;
  client.__dbhosting = true;
  let timer = null, idx = 0, started = false;

  function apply() {
    const cfg = readCfg();
    if (!cfg || !cfg.enabled || !client.user) return;
    const acts = (cfg.activities || []).filter(a => a && a.text);
    const a = acts.length ? acts[idx % acts.length] : null;
    idx++;
    const activities = !a ? [] : [a.type === 'custom'
      ? { type: ACT.custom, name: 'Custom Status', state: String(a.text) }
      : { type: ACT[a.type] != null ? ACT[a.type] : 0, name: String(a.text), ...(a.type === 'streaming' && a.url ? { url: String(a.url) } : {}) }];
    try {
      client.user.setPresence({ status: cfg.status || 'online', activities });
      fs.writeFileSync(file + '.applied', JSON.stringify({ at: Date.now(), status: cfg.status || 'online', activity: a ? { type: a.type, text: a.text } : null }));
    } catch {}
  }

  function schedule() {
    clearInterval(timer); timer = null;
    const cfg = readCfg();
    if (!cfg || !cfg.enabled || !Array.isArray(cfg.activities) || cfg.activities.filter(a => a && a.text).length < 2) return;
    // Discord allows about 5 presence updates a minute, so never rotate faster than every 20 s
    timer = setInterval(apply, Math.max(20, Number(cfg.intervalSec) || 60) * 1000);
    if (timer.unref) timer.unref();
  }

  const onReady = () => {
    if (started) return;
    started = true;
    apply(); schedule();
    try { fs.watchFile(file, { interval: 3000 }, () => { idx = 0; apply(); schedule(); }); } catch {}
  };
  // discord.js 14.17+ renamed "ready" to "clientReady" (listening to the old name prints a deprecation warning)
  const [maj, min] = String(djs.version || '0.0').split('.').map(Number);
  client.once(maj > 14 || (maj === 14 && min >= 17) ? 'clientReady' : 'ready', onReady);
}

if (file && !isNpm()) {
  try {
    const djs = require(require.resolve('discord.js', { paths: [process.cwd()] }));
    const Client = djs && djs.Client;
    if (Client && !Client.prototype.__dbhostingPatched) {
      Client.prototype.__dbhostingPatched = true;
      const login = Client.prototype.login;
      Client.prototype.login = function (...args) {
        try { startFor(this, djs); } catch {}
        return login.apply(this, args);
      };
    }
  } catch { /* not a discord.js bot (or not installed yet): nothing to do */ }
}
