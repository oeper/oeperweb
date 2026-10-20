#!/usr/bin/env python
"""Lets a script roam freely through apps in an Android emulator and turns what it sees into training examples for the tap model.

For every screen it reads the accessibility tree over adb (uiautomator), keeps a screenshot, and saves "Click on: <button name>" examples with the
button's real centre and box, in EXACTLY the format the phone app saves (see TrainingData.kt), so the Colab notebook trains on them unchanged.
It then taps things to reach new screens. Nothing here touches your phone or anyone else's data: only the emulator.

  python explore.py                       start the Small_Phone emulator, explore the built-in apps for 30 minutes, write the zip to Drive
  python explore.py --minutes 120         longer
  python explore.py --avd Pixel_Tablet    another emulator
  python explore.py --apps com.android.settings,com.android.calculator2     only these packages
  python explore.py --no-start            use an emulator that is already running (adb devices must list it)

Install more apps first for variety (free apps without a login are best):  adb install some-app.apk
Safety: it only stays inside the allowed packages (anything else it backs out of), never types, never taps words like delete / reset / erase / sign out,
and never opens Chrome, the Play Store or other Google apps (they would need a login or browse the web).
Standard library only (Python 3.8+). Ctrl+C stops it cleanly and still writes what it has.
"""
import argparse, glob, hashlib, json, os, random, re, shutil, subprocess, sys, time, zipfile
import xml.etree.ElementTree as ET

SDK = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Android', 'Sdk')
ADB = os.path.join(SDK, 'platform-tools', 'adb.exe')
EMU = os.path.join(SDK, 'emulator', 'emulator.exe')
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'explore-out')
DRIVE = next((p for p in (r'G:\My Drive',) if os.path.isdir(p)), None)

# Built-in apps that need no login. Only packages that are actually installed get used.
DEFAULT_APPS = [
    'com.android.settings', 'com.android.calculator2', 'com.google.android.calculator', 'com.android.deskclock', 'com.google.android.deskclock',
    'com.android.contacts', 'com.google.android.contacts', 'com.android.calendar', 'com.google.android.calendar', 'com.android.documentsui',
    'com.android.gallery3d', 'com.google.android.apps.photos', 'com.android.camera2', 'com.android.music', 'com.android.dialer', 'com.google.android.dialer',
    'com.android.messaging', 'com.google.android.apps.messaging', 'com.android.email', 'com.android.soundrecorder',
]
NEVER_PACKAGES = re.compile(r'chrome|vending|play\.games|youtube|gmail|maps|gms|googlequicksearch|assistant|setupwizard|providers|packageinstaller', re.I)
NEVER_LABELS = re.compile(r'delete|remove|erase|reset|factory|wipe|format|uninstall|sign out|log out|logout|clear (all|data|storage)|shut ?down|power off|restart|reboot|emergency|call|send|buy|purchase|pay|donat|sos|forget|unpair|disable|turn off|stop', re.I)
PER_SCREEN = 4


def adb(*a, timeout=40, binary=False):
    r = subprocess.run([ADB] + list(a), stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    return r.stdout if binary else r.stdout.decode('utf-8', 'replace')


def shell(cmd, timeout=40):
    return adb('shell', cmd, timeout=timeout)


def device_ready():
    return 'device' in [l.split('\t')[-1].strip() for l in adb('devices').splitlines()[1:] if l.strip()]


def start_emulator(avd):
    print('starting emulator', avd, '(first boot can take a few minutes)')
    log = open(os.path.join(HERE, 'emulator.log'), 'w')
    subprocess.Popen([EMU, '-avd', avd, '-no-snapshot-save', '-no-audio'], stdout=log, stderr=subprocess.STDOUT)
    t0 = time.time()
    while time.time() - t0 < 900:      # a cold boot on a busy PC can take 10 minutes; "offline" just means Android is still starting
        try:
            if shell('getprop sys.boot_completed', timeout=15).strip() == '1':
                break
        except subprocess.TimeoutExpired:
            pass
        time.sleep(5)
    else:
        sys.exit('the emulator did not finish booting (see emulator.log)')
    shell('settings put global window_animation_scale 0; settings put global transition_animation_scale 0; settings put global animator_duration_scale 0')
    shell('input keyevent 82')    # unlock
    time.sleep(2)


class Node:
    __slots__ = ('text', 'desc', 'inner', 'rid', 'cls', 'pkg', 'clickable', 'editable', 'password', 'l', 't', 'r', 'b')

    @property
    def label(self):
        return ' '.join((self.text or self.desc or self.inner or '').split())


def dump():
    """The current screen's nodes, or None when it could not be read."""
    out = shell('uiautomator dump /sdcard/ui.xml', timeout=30)
    if 'dumped' not in out:
        return None
    xml = adb('exec-out', 'cat', '/sdcard/ui.xml', binary=True, timeout=30).decode('utf-8', 'replace')
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return None
    nodes = []

    def inner_label(e):
        """A tappable container (a settings row, a card) usually has no text itself: its name is the first text inside it."""
        for c in e.iter('node'):
            if c is not e:
                t = (c.get('text') or c.get('content-desc') or '').strip()
                if t:
                    return t
        return ''

    for e in root.iter('node'):
        m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', e.get('bounds', ''))
        if not m:
            continue
        n = Node()
        n.text, n.desc, n.rid, n.cls, n.pkg = e.get('text', ''), e.get('content-desc', ''), e.get('resource-id', ''), e.get('class', ''), e.get('package', '')
        n.inner = inner_label(e) if (e.get('clickable') == 'true' and not (n.text or n.desc).strip()) else ''
        n.clickable = e.get('clickable') == 'true' and e.get('enabled') == 'true'
        n.editable = 'EditText' in n.cls
        n.password = e.get('password') == 'true'
        n.l, n.t, n.r, n.b = map(int, m.groups())
        nodes.append(n)
    return nodes


def screenshot():
    png = adb('exec-out', 'screencap', '-p', binary=True, timeout=30)
    return png if png[:4] == b'\x89PNG' else None


def png_size(png):
    """Width and height from the PNG header."""
    import struct
    return struct.unpack('>II', png[16:24])


def signature(nodes):
    labels = sorted({n.label for n in nodes if n.label})
    return hashlib.md5((nodes[0].pkg + '|' + '|'.join(labels)).encode('utf-8')).hexdigest()[:12] if nodes else ''


def installed(pkgs):
    have = set(l.split(':', 1)[1].strip() for l in shell('pm list packages').splitlines() if ':' in l)
    return [p for p in pkgs if p in have]


def launch(pkg):
    shell(f'monkey -p {pkg} -c android.intent.category.LAUNCHER 1', timeout=30)
    time.sleep(2.5)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--avd', default='Small_Phone')
    ap.add_argument('--minutes', type=float, default=30)
    ap.add_argument('--apps', default='')
    ap.add_argument('--no-start', action='store_true')
    ap.add_argument('--keep-open', action='store_true', help="don't close the emulator at the end")
    ap.add_argument('--seed', type=int, default=None)
    args = ap.parse_args()
    random.seed(args.seed)
    if not os.path.exists(ADB):
        sys.exit('adb not found at ' + ADB)
    started = False
    if not device_ready():
        if args.no_start:
            sys.exit('no emulator is running (adb devices is empty)')
        start_emulator(args.avd); started = True
    first = screenshot()
    if not first:
        sys.exit('could not take a screenshot')
    # the screenshot's own size: `wm size` shows the physical size even when an override (like 1080x2280 on the tablet emulator) is what is drawn
    print('screen', *png_size(first))
    wanted = [p for p in (args.apps.split(',') if args.apps else DEFAULT_APPS) if p and not NEVER_PACKAGES.search(p)]
    apps = installed(wanted)
    if not apps:
        sys.exit('none of these apps are installed: ' + ', '.join(wanted))
    allowed = set(apps)
    print('exploring:', ', '.join(apps))

    shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
    jsonl = open(os.path.join(OUT, 'train.jsonl'), 'w', encoding='utf-8')
    seen_sig = {}          # signature -> screenshot file name (one picture per screen)
    tapped = set()         # (signature, label) already tapped
    recorded = set()       # (signature, label) already saved as an example
    count = 0
    t_end = time.time() + args.minutes * 60
    per_app = max(60.0, args.minutes * 60 / len(apps))

    def record(nodes, sig, shot):
        """Same rule as TrainingData.record on the phone: up to 4 clickable, unambiguous, sensibly sized buttons per screen."""
        nonlocal count
        W, H = png_size(shot)
        labels = {}
        for n in nodes:
            labels[n.label.lower()] = labels.get(n.label.lower(), 0) + 1
        picks = [n for n in nodes if n.clickable and not n.editable and not n.password and 2 <= len(n.label) <= 40 and labels[n.label.lower()] == 1
                 and (sig, n.label) not in recorded and n.l >= 0 and n.t >= 0 and n.r <= W and n.b <= H and n.r - n.l >= 24 and n.b - n.t >= 24
                 and (n.r - n.l) * (n.b - n.t) < W * H * 0.4]
        random.shuffle(picks)
        picks = picks[:PER_SCREEN]
        if not picks or any(n.password for n in nodes):
            return
        if sig not in seen_sig:
            name = f's{int(time.time() * 1000)}.png'
            open(os.path.join(OUT, name), 'wb').write(shot)
            seen_sig[sig] = name
        for n in picks:
            x = min(999, max(0, int((n.l + n.r) / 2 / W * 999))); y = min(999, max(0, int((n.t + n.b) / 2 / H * 999)))
            label = n.label
            user = 'The user query: Click on: ' + label[:160] + '\n\nCurrent Screenshot: <image>\n\nPlease analyze the current screenshot and history to generate the next step.'
            answer = ('Thought: I need to click "' + label + '".\nAction: "Click on \\"' + label + '\\"."\n<tool_call>\n'
                      '{"name": "mobile_use", "arguments": {"action": "click", "coordinate": [%d, %d]}}\n</tool_call>' % (x, y))
            jsonl.write(json.dumps({'messages': [{'role': 'user', 'content': user}, {'role': 'assistant', 'content': answer}], 'images': [seen_sig[sig]],
                                    'box': [int(n.l / W * 999), int(n.t / H * 999), int(n.r / W * 999), int(n.b / H * 999)], 'app': n.pkg}, ensure_ascii=False) + '\n')
            recorded.add((sig, label)); count += 1
        jsonl.flush()

    try:
        for app in apps:
            if time.time() > t_end:
                break
            launch(app)
            app_end = min(t_end, time.time() + per_app)
            stuck = 0
            print(f'-- {app}')
            while time.time() < app_end:
                nodes = dump()
                if not nodes:
                    if not device_ready():
                        print('the emulator is gone (it crashed or was closed): saving what was collected')
                        raise KeyboardInterrupt
                    stuck += 1
                    shell('input keyevent 4'); time.sleep(1)
                    if stuck > 4: launch(app); stuck = 0
                    continue
                pkg = nodes[0].pkg
                if pkg not in allowed:                      # wandered out (launcher, a Google app, a dialog from the system): back in
                    shell('input keyevent 4'); time.sleep(0.8)
                    nodes2 = dump()
                    if not nodes2 or nodes2[0].pkg not in allowed:
                        launch(app)
                    continue
                if any(n.password for n in nodes):
                    shell('input keyevent 4'); continue
                sig = signature(nodes)
                shot = screenshot()
                if shot:
                    record(nodes, sig, shot)
                options = [n for n in nodes if n.clickable and not n.editable and n.label and not NEVER_LABELS.search(n.label)
                           and n.r - n.l >= 24 and n.b - n.t >= 24 and (sig, n.label) not in tapped]
                if not options:
                    stuck += 1
                    shell('input keyevent 4'); time.sleep(0.7)
                    if stuck > 3: launch(app); stuck = 0
                    continue
                stuck = 0
                n = random.choice(options)
                tapped.add((sig, n.label))
                shell(f'input tap {(n.l + n.r) // 2} {(n.t + n.b) // 2}')
                time.sleep(1.1)
                if random.random() < 0.3:                  # sometimes go back so shallow screens get visited again
                    shell('input keyevent 4'); time.sleep(0.6)
                if len(tapped) % 25 == 0:
                    print(f'   {count} examples from {len(seen_sig)} screens')
            print(f'   {app}: {count} examples so far')
    except KeyboardInterrupt:
        print('\nstopping')
    finally:
        jsonl.close()
        if started and not args.keep_open:
            adb('emu', 'kill')

    print(f'{count} examples from {len(seen_sig)} different screens')
    if not count:
        sys.exit('nothing was recorded')
    name = f'epicai-training-explore-{int(time.time())}.zip'
    dest_dir = os.path.join(DRIVE, 'epicai-training') if DRIVE else os.path.expanduser('~/Downloads')
    os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, name)
    with zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in glob.glob(os.path.join(OUT, '*')):
            z.write(f, os.path.basename(f))
    print('wrote', dest)


if __name__ == '__main__':
    main()
