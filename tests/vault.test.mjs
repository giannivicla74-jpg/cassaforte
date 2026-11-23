import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../core.js');

const {
  ITER_OLD, DAY_MS, iterOf, b64, unb64, esc,
  derive, encryptVault, decryptVault,
  clean, recordPasswordChange, parseItems, normUrl, safeUrl,
  mergeItems, auditItems, filterItems, strength,
  generatePassword, SETS, WORDS_IT, parseCsvItems,
  generateCloudCode, normalizeCloudCode, cloudDocId
} = core;

test('iterOf restituisce le iterazioni valide o il fallback ITER_OLD', () => {
  assert.equal(iterOf({ iter: 600000 }), 600000);
  assert.equal(iterOf({ iter: 100000 }), 100000);
  assert.equal(iterOf({}), ITER_OLD);
  assert.equal(iterOf({ iter: 50 }), ITER_OLD);
  assert.equal(iterOf({ iter: 99999999 }), ITER_OLD);
  assert.equal(iterOf(null), ITER_OLD);
});

test('cifratura e decifratura round-trip con PBKDF2 + AES-GCM', async () => {
  const pw = 'passphrase-molto-robusta-test';
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await derive(pw, salt, 100000);
  const original = [
    { id: '1', name: 'Banca', user: 'mario', pass: 'S3cr3t!', url: 'https://banca.it', note: 'PIN 1234', cat: 'Banca', fav: true }
  ];

  const payload = JSON.parse(await encryptVault(key, salt, 100000, original));
  assert.equal(payload.v, 1);
  assert.equal(payload.iter, 100000);

  const decrypted = await decryptVault(pw, payload);
  assert.equal(decrypted.iter, 100000);
  assert.deepEqual(decrypted.items, original);

  await assert.rejects(() => decryptVault('password-sbagliata', payload));
});

test('b64 e unb64 gestiscono correttamente byte arbitrari', () => {
  const bytes = new Uint8Array([0, 1, 127, 128, 255]);
  assert.deepEqual(unb64(b64(bytes)), bytes);
});

test('esc esegue escape dei caratteri HTML pericolosi', () => {
  assert.equal(esc('<script>alert("x\'&")</script>'), '&lt;script&gt;alert(&quot;x&#39;&amp;&quot;)&lt;/script&gt;');
  assert.equal(esc(null), '');
});

test('clean e parseItems supportano categorie personalizzate e deduplicano ID', () => {
  const raw = JSON.stringify([
    { id: 'dup', name: '  ', user: 123, cat: '', fav: 1 },
    { id: 'dup', name: 'Netflix', user: 'dev', cat: 'Streaming', fav: false },
    { name: 'SenzaId', cat: 'Tutti' }
  ]);
  const parsed = parseItems(raw);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].name, 'Senza nome');
  assert.equal(parsed[0].user, '123');
  assert.equal(parsed[0].cat, 'Altro');
  assert.equal(parsed[0].fav, true);
  assert.equal(parsed[1].cat, 'Streaming');
  assert.equal(parsed[2].cat, 'Altro');
  assert.notEqual(parsed[0].id, parsed[1].id);
  assert.ok(parsed[2].id.length > 0);

  assert.throws(() => parseItems('{"not":"an-array"}'));
  assert.deepEqual(clean(null).name, 'Senza nome');
});

test('recordPasswordChange conserva le ultime 5 password precedenti', () => {
  let it = { id: '1', name: 'Test', pass: 'p0', updatedAt: 1000 };
  for (let i = 1; i <= 6; i++) {
    const meta = recordPasswordChange(it, 'p' + i, 1000 + i * 1000);
    it = { ...it, pass: 'p' + i, ...meta };
  }
  assert.equal(it.pass, 'p6');
  assert.equal(it.history.length, 5);
  assert.deepEqual(it.history.map(h => h.pass), ['p5', 'p4', 'p3', 'p2', 'p1']);
});

test('auditItems rileva password duplicate, deboli e vecchie (>1 anno)', () => {
  const now = 2_000_000_000_000;
  const list = [
    { id: '1', name: 'A', pass: 'StessaPasswordForte!99', updatedAt: now },
    { id: '2', name: 'B', pass: 'StessaPasswordForte!99', updatedAt: now },
    { id: '3', name: 'C', pass: '1234', updatedAt: now },
    { id: '4', name: 'D', pass: 'UnicaFortePassword!88', updatedAt: now - 400 * DAY_MS },
    { id: '5', name: 'E', pass: 'UnicaForteRecente!77', updatedAt: now }
  ];
  const audit = auditItems(list, now);
  assert.deepEqual([...audit.dupIds], ['1', '2']);
  assert.deepEqual([...audit.weakIds], ['3']);
  assert.deepEqual([...audit.oldIds], ['4']);
  assert.equal(audit.warnIds.has('5'), false);
  assert.equal(audit.warnIds.size, 4);
});

test('normUrl e safeUrl bloccano schemi non sicuri', () => {
  assert.equal(normUrl('example.com'), 'https://example.com');
  assert.equal(normUrl('http://localhost:8080'), 'http://localhost:8080');
  assert.equal(safeUrl('https://example.com/login'), 'https://example.com/login');
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('data:text/html,<script>alert(1)</script>'), '');
  assert.equal(safeUrl('not a url'), '');
});

test('filterItems cerca nelle note, filtra per !warn e ordina per az/recent/cat', () => {
  const now = Date.now();
  const list = [
    { id: '1', name: 'Zeta', user: 'u1', url: 'https://zeta.it', note: 'codice recupero alpha', cat: 'Streaming', fav: false, pass: '123', updatedAt: now - 1000 },
    { id: '2', name: 'Alfa', user: 'u2', url: 'https://alfa.it', note: '', cat: 'Banca', fav: true, pass: 'FortePassword!123', updatedAt: now - 3000 },
    { id: '3', name: 'Beta', user: 'u3', url: 'https://beta.it', note: '', cat: 'Email', fav: false, pass: 'AltraForte!456', updatedAt: now - 2000 }
  ];

  assert.deepEqual(filterItems(list, 'Tutti', '', 'az').map(x => x.id), ['2', '3', '1']);
  assert.deepEqual(filterItems(list, 'Tutti', '', 'recent').map(x => x.id), ['1', '3', '2']);
  assert.deepEqual(filterItems(list, 'Tutti', '', 'cat').map(x => x.id), ['3', '2', '1']);
  assert.deepEqual(filterItems(list, '!warn', '', 'az').map(x => x.id), ['1']);
  assert.deepEqual(filterItems(list, 'Tutti', 'alpha').map(x => x.id), ['1']);
});

test('mergeItems deduplica per id e per contenuto identico con id diverso', () => {
  const current = [
    { id: 'a1', name: 'Gmail', user: 'a@b.it', pass: 'p1', url: '', note: '', cat: 'Email', fav: false },
    { id: 'a2', name: 'Banca', user: 'm', pass: 'old', url: '', note: '', cat: 'Banca', fav: true }
  ];
  const imported = [
    { id: 'x99', name: 'Gmail', user: 'a@b.it', pass: 'p1', url: '', note: '', cat: 'Email', fav: false },
    { id: 'a2', name: 'Banca', user: 'm', pass: 'new', url: '', note: '', cat: 'Banca', fav: true },
    { id: 'a3', name: 'Amazon', user: 'm', pass: 'p3', url: '', note: '', cat: 'Shopping', fav: false }
  ];

  const res = mergeItems(current, imported);
  assert.equal(res.same, 1);
  assert.equal(res.added, 2);
  assert.equal(res.items.length, 4);
});

test('generatePassword supporta modalità caratteri e passphrase in italiano', () => {
  assert.equal(generatePassword({ lower: false, upper: false, num: false, sym: false }), '');

  const pw = generatePassword({ mode: 'chars', len: 24, lower: true, upper: true, num: true, sym: true });
  assert.equal(pw.length, 24);
  assert.ok([...pw].some(c => SETS.lower.includes(c)));

  const phrase = generatePassword({ mode: 'words', words: 4, upper: true, num: true });
  const parts = phrase.split('-');
  assert.equal(parts.length, 5); // 4 parole + numero a 2 cifre
  assert.match(parts[0], /^[A-Z][a-z]+$/);
  assert.ok(WORDS_IT.includes(parts[0].toLowerCase()));
  assert.match(parts[4], /^\d{2}$/);
  assert.equal(strength(phrase).t, 'Forte');
});

test('parseCsvItems importa CSV in formato Chrome e Bitwarden', () => {
  const chromeCsv = 'name,url,username,password,note\nNetflix,https://www.netflix.com,mario@test.it,"Pass,Con""Virgola",Profilo famiglia\n,https://github.com,dev,ghPass123,\n';
  const items = parseCsvItems(chromeCsv, 123456);
  assert.equal(items.length, 2);
  assert.equal(items[0].name, 'Netflix');
  assert.equal(items[0].pass, 'Pass,Con"Virgola');
  assert.equal(items[0].note, 'Profilo famiglia');
  assert.equal(items[1].name, 'github.com');

  const bwCsv = 'folder,favorite,type,name,notes,fields,login_uri,login_username,login_password\nBanca,1,login,Intesa,Nota BW,,banca.it,u1,p1';
  const bwItems = parseCsvItems(bwCsv, 123456);
  assert.equal(bwItems.length, 1);
  assert.equal(bwItems[0].cat, 'Banca');
  assert.equal(bwItems[0].fav, true);
  assert.equal(bwItems[0].url, 'https://banca.it');
});

test('generateCloudCode e cloudDocId generano un ID SHA-256 deterministico', async () => {
  const code = generateCloudCode();
  assert.match(code, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
  assert.equal(normalizeCloudCode(code).length, 16);

  const id1 = await cloudDocId(code);
  const id2 = await cloudDocId(code.toLowerCase().replace(/-/g, ' '));
  assert.equal(id1, id2);
  assert.match(id1, /^[0-9a-f]{64}$/);

  await assert.rejects(() => cloudDocId('corto'));
});

/* ---- v1.14: schede speciali e riconoscimento automatico ---- */
test('clean conserva carte, Wi-Fi e note e ripulisce gli account normali', () => {
  const c = core.clean({ id: 'a', name: 'Visa', type: 'card', holder: 'MARIO', number: '4111 1111 1111 1111', exp: '12/29', cvv: 123, pin: '' });
  assert.equal(c.type, 'card');
  assert.equal(c.cvv, '123');
  assert.equal(c.number, '4111 1111 1111 1111');
  const w = core.clean({ id: 'b', name: 'Casa', type: 'wifi', pass: 'segreta', wsec: 'WPA', whidden: 1 });
  assert.equal(w.type, 'wifi'); assert.equal(w.whidden, true);
  const l = core.clean({ id: 'c', name: 'Gmail', type: 'login', number: 'x' });
  assert.equal(l.type, undefined); assert.equal(l.number, undefined);
  const strano = core.clean({ id: 'd', name: 'X', type: 'hacker' });
  assert.equal(strano.type, undefined);
});

test('sameItem distingue due carte con lo stesso nome ma numero diverso', () => {
  const a = core.clean({ id: '1', name: 'Visa', type: 'card', number: '4111' });
  const b = core.clean({ id: '2', name: 'Visa', type: 'card', number: '4222' });
  assert.equal(core.sameItem(a, b), false);
  assert.equal(core.sameItem(a, { ...a, id: '3' }), true);
  // un vecchio account senza campi extra resta uguale a se stesso
  const old = { name: 'A', user: 'u', pass: 'p', url: '', note: '', cat: 'Altro' };
  assert.equal(core.sameItem(old, core.clean({ ...old, id: 'z' })), true);
});

test('carte: circuito, formattazione e controllo del numero', () => {
  assert.equal(core.cardBrand('4111 1111 1111 1111'), 'VISA');
  assert.equal(core.cardBrand('5500000000000004'), 'MASTERCARD');
  assert.equal(core.cardBrand('378282246310005'), 'AMEX');
  assert.equal(core.fmtCard('4111111111111111'), '4111 1111 1111 1111');
  assert.equal(core.fmtCard('378282246310005'), '3782 822463 10005');
  assert.equal(core.luhnOk('4111 1111 1111 1111'), true);
  assert.equal(core.luhnOk('4111 1111 1111 1112'), false);
});

test('wifiQr crea il testo standard con i caratteri speciali protetti', () => {
  assert.equal(core.wifiQr('Casa Rossi', 'pa;ss', 'WPA', false), String.raw`WIFI:T:WPA;S:Casa Rossi;P:pa\;ss;;`);
  assert.equal(core.wifiQr('Ospiti', '', 'nopass', true), 'WIFI:T:nopass;S:Ospiti;H:true;;');
});

test('recognize riconosce i servizi più comuni senza falsi positivi', () => {
  assert.deepEqual(core.recognize('Amazon'), { cat: 'Shopping', url: 'amazon.it', key: 'amazon' });
  assert.equal(core.recognize('Intesa Sanpaolo').cat, 'Banca');
  assert.equal(core.recognize('PostePay Evolution').url, 'postepay.it');
  assert.equal(core.recognize('Netflix famiglia').cat, 'Svago');
  assert.equal(core.recognize('Disney+').cat, 'Svago');
  assert.equal(core.recognize('SPID Poste').cat, 'Pubblica Amm.');
  assert.equal(core.recognize('Booking').cat, 'Viaggi');   // non deve diventare "ING" (Banca)
  assert.equal(core.recognize('Palestra Fitness'), null);
  assert.equal(core.recognize('a'), null);
});

/* ---- v1.16: foto allegate ---- */
test('clean accetta solo foto valide, al massimo 3, su ogni tipo di scheda', () => {
  const ok = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  const l = core.clean({ id: 'a', name: 'Gmail', photos: [ok, 'javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', ok + '"onerror="x', ok, ok, ok] });
  assert.equal(l.photos.length, 3);
  assert.ok(l.photos.every(p => p === ok));
  const c = core.clean({ id: 'b', name: 'Visa', type: 'card', photos: [ok] });
  assert.equal(c.photos.length, 1);
  const vuota = core.clean({ id: 'c', name: 'X', photos: ['nulla'] });
  assert.equal(vuota.photos, undefined);
  assert.equal(core.sameItem({ ...c, id: 'z' }, core.clean({ ...c, photos: [] })), false);
});

test('scheda documento: tiene CF, ente e date; cambiando tipo spariscono', () => {
  const d = core.clean({ id: 'd', name: 'CI', type: 'doc', docType: 'Carta d’Identità', number: 'CA123', cf: 'RSSMRA80A01H501U', issuer: 'Comune', issued: '2020-01-02', exp: '2030-01-02' });
  assert.equal(d.type, 'doc');
  assert.equal(d.cf, 'RSSMRA80A01H501U');
  assert.equal(d.issued, '2020-01-02');
  const l = core.clean({ ...d, type: undefined });
  assert.equal(l.cf, undefined);
  assert.equal(l.issuer, undefined);
});

test('codice a barre Code 39 del Codice Fiscale', () => {
  const svg = core.code39Svg('rssmra80a01h501u');
  assert.ok(svg.startsWith('<svg'));
  // 16 caratteri + 2 asterischi, 5 barre ciascuno, più il rettangolo bianco di sfondo
  assert.equal((svg.match(/<rect/g) || []).length, 18 * 5 + 1);
  assert.ok(svg.includes('RSSMRA80A01H501U'));
  assert.equal(core.code39Svg('§§§'), '');
  assert.ok(!core.code39Svg('A"><script>').includes('<script'));
});

test('Radar Scadenze: carte MM/AA e documenti AAAA-MM-GG', () => {
  const now = new Date(2026, 10, 23, 12).getTime();
  assert.equal(core.expiryInfo({ type: 'card', exp: '11/26' }, now).days, 7); // dal 23 al 30 novembre
  assert.equal(core.expiryInfo({ type: 'card', exp: '10/26' }, now).expired, true);
  assert.equal(core.expiryInfo({ type: 'doc', exp: '2026-11-24' }, now).label, 'scade domani');
  assert.equal(core.expiryInfo({ type: 'doc', exp: '24/11/2026' }, now), null);
  assert.equal(core.expiryInfo({ name: 'login', exp: '11/26' }, now), null);
  const list = core.expiringItems([
    { id: 'a', type: 'doc', exp: '2027-06-01' },
    { id: 'b', type: 'doc', exp: '2026-12-20' },
    { id: 'c', type: 'card', exp: '10/26' }
  ], now, 60);
  assert.deepEqual(list.map(x => x.item.id), ['c', 'b']);
});

test('Furti online: si invia solo il prefisso di 5 caratteri e si legge il conteggio', async () => {
  assert.equal(await core.sha1Hex('password'), '5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8');
  const risposta = '1E4C9B93F3F0682250B6CF8331B7EE68FD8:3861493\r\n0018A45C4D1DEF81644B54AB7F969B88D65:0';
  assert.equal(core.parsePwnedCount(risposta, '1e4c9b93f3f0682250b6cf8331b7ee68fd8'), 3861493);
  assert.equal(core.parsePwnedCount(risposta, 'FFFFF'), 0);
  const chiesti = [];
  const vero = globalThis.fetch;
  globalThis.fetch = async u => { chiesti.push(String(u)); return new Response(risposta); };
  try {
    assert.equal(await core.checkPwnedPassword('password', new Map()), 3861493);
  } finally { globalThis.fetch = vero; }
  assert.deepEqual(chiesti, ['https://api.pwnedpasswords.com/range/5BAA6']);
});

test('Radar Scadenze: oggi, ieri e domani contati per giorni di calendario', () => {
  for (const ora of [0, 9, 23]) {
    const now = new Date(2026, 10, 23, ora, 30).getTime();
    assert.equal(core.expiryInfo({ type: 'doc', exp: '2026-11-23' }, now).label, 'scade oggi');
    assert.equal(core.expiryInfo({ type: 'doc', exp: '2026-11-23' }, now).expired, false);
    const ieri = core.expiryInfo({ type: 'doc', exp: '2026-11-22' }, now);
    assert.equal(ieri.label, 'scaduto ieri');
    assert.equal(ieri.expired, true);
  }
  // passaggio all'ora legale (fine marzo)
  assert.equal(core.expiryInfo({ type: 'doc', exp: '2027-04-01' }, new Date(2027, 2, 20, 12).getTime()).days, 12);
});

test('Codici 2FA: valori ufficiali dello standard RFC 6238', async () => {
  const sha1 = core.parseTotp('otpauth://totp/Prova?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&digits=8');
  for (const [t, code] of [[59, '94287082'], [1111111109, '07081804'], [1234567890, '89005924'], [2000000000, '69279037']])
    assert.equal(await core.totpCode(sha1, t * 1000), code);
  const sha256 = core.parseTotp('otpauth://totp/X?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA&digits=8&algorithm=SHA256');
  assert.equal(await core.totpCode(sha256, 59000), '46119246');
  // chiave scritta come la mostrano i siti: minuscole e spazi
  const plain = core.parseTotp('gezd gnbv gy3t qojq gezd gnbv gy3t qojq');
  assert.equal(plain.digits, 6);
  assert.equal(await core.totpCode(plain, 59000), '287082');
  assert.equal(core.totpLeft(plain, 59000), 1);
  assert.equal(core.totpLeft(plain, 60000), 30);
});

test('Codici 2FA: chiavi non valide rifiutate, solo negli account', () => {
  for (const bad of ['', 'ciao!', 'ABC', 'otpauth://hotp/X?secret=GEZDGNBVGY3TQOJQ', 'otpauth://totp/X?secret=GEZDGNBVGY3TQOJQ&algorithm=MD5'])
    assert.equal(core.parseTotp(bad), null, bad);
  const uri = core.parseTotp('otpauth://totp/Amazon%3Amario%40x.it?secret=JBSWY3DPEHPK3PXP&issuer=Amazon');
  assert.equal(uri.issuer, 'Amazon');
  assert.equal(uri.label, 'Amazon:mario@x.it');
  assert.equal(core.clean({ id: 'a', name: 'A', totp: ' JBSWY3DPEHPK3PXP ' }).totp, 'JBSWY3DPEHPK3PXP');
  assert.equal(core.clean({ id: 'b', name: 'B', type: 'note', totp: 'JBSWY3DPEHPK3PXP' }).totp, undefined);
  assert.equal(core.sameItem(core.clean({ id: 'a', name: 'A' }), core.clean({ id: 'a', name: 'A', totp: 'JBSWY3DPEHPK3PXP' })), false);
  const csv = core.parseCsvItems('name,login_username,login_password,login_totp\nGoogle,io,pw,JBSWY3DPEHPK3PXP\nAltro,io,pw,nonvalida!');
  assert.equal(csv[0].totp, 'JBSWY3DPEHPK3PXP');
  assert.equal(csv[1].totp, undefined);
});

test('Cestino: tiene 30 giorni, al massimo 50, cifrato e leggibile solo con la chiave giusta', async () => {
  const now = Date.UTC(2026, 10, 23);
  const e = (id, daysAgo) => ({ item: { id, name: 'S' + id }, deletedAt: now - daysAgo * DAY_MS });
  const list = core.purgeTrash([e('a', 1), e('b', 31), e('c', 29.9), null, { item: 'x', deletedAt: now }], now);
  assert.deepEqual(list.map(x => x.item.id), ['a', 'c']);
  assert.equal(core.trashLeftDays(list[0], now), 29);
  assert.equal(core.purgeTrash(Array.from({ length: 70 }, (_, i) => e('n' + i, 0)), now).length, core.TRASH_MAX);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const k = await derive('Password-di-prova-1', salt, 1000);
  const altra = await derive('Password-diversa-2', salt, 1000);
  const str = await core.encryptTrash(k, list);
  assert.deepEqual(Object.keys(JSON.parse(str)), ['v', 'iv', 'data']); // solo dati cifrati, nessun nome in chiaro
  assert.ok(!str.includes('"name"'));
  assert.deepEqual((await core.decryptTrash(k, str, now)).map(x => x.item.id), ['a', 'c']);
  assert.equal(await core.decryptTrash(altra, str, now), null);
  assert.deepEqual(await core.decryptTrash(k, null, now), []);
});

test('Aggiornamenti: confronto versioni e version.json allineato ad APP_VERSION', async () => {
  assert.equal(core.cmpVer('1.18.0', '1.9.2'), 1);
  assert.equal(core.cmpVer('1.17.0', '1.17.0'), 0);
  assert.equal(core.cmpVer('1.17', '1.17.1'), -1);
  const fs = await import('node:fs');
  const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const ver = /const APP_VERSION='([^']+)'/.exec(app)[1];
  const json = JSON.parse(fs.readFileSync(new URL('../version.json', import.meta.url), 'utf8'));
  assert.equal(json.version, ver, 'aggiorna version.json insieme ad APP_VERSION');
  assert.equal(/\['([^']+)'/.exec(app.slice(app.indexOf('const CHANGELOG')))[1], ver, 'la prima voce di CHANGELOG deve essere la versione attuale');
});
