// Проверка API без браузера: node tests/api.test.cjs
// Нужны PHP 8.3+ (pdo_mysql) и MariaDB/MySQL. Подключение — XS_TEST_DSN / XS_TEST_USER / XS_TEST_PASSWORD
// (по умолчанию mysql:host=127.0.0.1;dbname=xsatsu_test, xsatsu/testpass). База очищается перед тестом.
const {spawn, execFileSync} = require('child_process'), path = require('path'), fs = require('fs'), os = require('os'), assert = require('assert'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'xs-storage-'));
const env = {...process.env, XS_ENV: 'dev', XS_DB_DSN: process.env.XS_TEST_DSN || 'mysql:host=127.0.0.1;dbname=xsatsu_test;charset=utf8mb4', XS_DB_USER: process.env.XS_TEST_USER || 'xsatsu',
  XS_DB_PASSWORD: process.env.XS_TEST_PASSWORD ?? 'testpass', XS_STORAGE_DIR: storage, XS_SETUP_TOKEN: 'setup-123', XS_COOKIE_SECURE: '0', XS_PUBLIC_ORIGIN: 'http://127.0.0.1:8097', XS_CONFIG: '/nonexistent'};
// Чистая база
execFileSync('php', ['-r', `$p=new PDO(getenv('XS_DB_DSN'),getenv('XS_DB_USER'),getenv('XS_DB_PASSWORD'));$p->exec('SET FOREIGN_KEY_CHECKS=0');foreach($p->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $t)$p->exec("DROP TABLE \`$t\`");`], {env});
console.log(execFileSync('php', [path.join(root, 'server/bin/migrate.php')], {env}).toString().trim());
const srv = spawn('php', ['-S', '127.0.0.1:8097', '-t', path.join(root, 'app'), path.join(root, 'tools/dev-router.php')], {env, stdio: ['ignore', 'ignore', 'pipe']});
let srvLog = ''; srv.stderr.on('data', d => { srvLog += d; });

class Client {
  constructor() { this.cookie = ''; this.csrf = ''; }
  async call(method, route, body, {raw, headers = {}} = {}) {
    const h = {...headers, Origin: 'http://127.0.0.1:8097'};
    if (this.cookie) h.Cookie = this.cookie;
    if (this.csrf) h['X-XS-CSRF'] = this.csrf;
    if (body !== undefined && !raw) h['Content-Type'] = 'application/json';
    const r = await fetch('http://127.0.0.1:8097/api/index.php?r=' + route, {method, headers: h, body: raw ? body : body === undefined ? undefined : JSON.stringify(body)});
    const set = r.headers.get('set-cookie'); if (set) this.cookie = set.split(';')[0];
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('json') ? await r.json() : new Uint8Array(await r.arrayBuffer());
    if (data && data.csrf !== undefined) this.csrf = data.csrf || '';
    return {status: r.status, data};
  }
}
const ok = (r, status = 200) => { assert.strictEqual(r.status, status, JSON.stringify(r.data).slice(0, 300)); return r.data; };

(async () => {
  for (let i = 0; i < 50; i++) { try { await fetch('http://127.0.0.1:8097/api/index.php?r=v1/health'); break; } catch (e) { await new Promise(r => setTimeout(r, 100)); } }
  const a = new Client(), b = new Client(), anon = new Client();
  // Здоровье и первый запуск
  const health = ok(await anon.call('GET', 'v1/health'));
  assert.ok(health.ok && health.db && health.storage, JSON.stringify(health));
  // Шрифты Google Fonts: проверка параметров (без обращения к Google)
  ok(await anon.call('GET', 'v1/fonts/google&family=' + encodeURIComponent('../etc/passwd')), 422);
  ok(await anon.call('GET', 'v1/fonts/google&family=Rubik&weight=750'), 422);
  ok(await anon.call('GET', 'v1/fonts/google&family=Rubik&weight=1000'), 422);
  let st = ok(await a.call('GET', 'v1/auth/state'));
  assert.ok(st.setupNeeded && st.setupAllowed && !st.user);
  ok(await a.call('POST', 'v1/auth/setup', {token: 'wrong', login: 'admin', password: 'password1'}), 403);
  st = ok(await a.call('POST', 'v1/auth/setup', {token: 'setup-123', login: 'Admin', name: 'Артём', password: 'password1'}));
  // Картинка по ссылке: только после входа и только на публичные адреса (защита от SSRF, без обращения в интернет)
  ok(await anon.call('GET', 'v1/images/fetch&url=' + encodeURIComponent('https://example.com/a.jpg')), 401);
  for (const bad of ['ftp://example.com/a.jpg', 'file:///etc/passwd', 'http://127.0.0.1/a.png', 'http://localhost/a.png', 'http://10.0.0.5/a.png', 'http://192.168.1.1/a.png',
    'http://169.254.169.254/latest/meta-data/', 'http://100.108.243.219/a.png', 'http://[::1]/a.png', 'http://[::ffff:127.0.0.1]/a.png', 'https://example.com:22/a.png', 'http://user:pw@example.com/a.png', 'http://intranet.local/a.png', 'http://2130706433/a.png'])
    ok(await a.call('GET', 'v1/images/fetch&url=' + encodeURIComponent(bad)), 422);
  assert.strictEqual(st.user.role, 'admin'); assert.strictEqual(st.user.login, 'admin'); assert.ok(st.csrf);
  ok(await anon.call('POST', 'v1/auth/setup', {token: 'setup-123', login: 'x2', password: 'password1'}), 409);
  // CSRF и чужой Origin
  const noCsrf = new Client(); noCsrf.cookie = a.cookie;
  ok(await noCsrf.call('PUT', 'v1/settings/user', {prefs: {}}), 403);
  // Регистрация по приглашению
  ok(await b.call('POST', 'v1/auth/register', {login: 'maria', password: 'password2'}), 422);
  const inv = ok(await a.call('POST', 'v1/admin/invites', {note: 'кафедра'}));
  st = ok(await b.call('POST', 'v1/auth/register', {invite: inv.code, login: 'maria', name: 'Мария', password: 'password2'}));
  assert.strictEqual(st.user.role, 'user');
  ok(await new Client().call('POST', 'v1/auth/register', {invite: inv.code, login: 'other', password: 'password2'}), 403);
  ok(await b.call('GET', 'v1/admin/users'), 403);
  // Файлы по хэшу
  const pdf = Buffer.from('%PDF-1.4\n% тест\n' + 'x'.repeat(1000));
  const sha = crypto.createHash('sha256').update(pdf).digest('hex');
  assert.deepStrictEqual(ok(await a.call('POST', 'v1/assets/missing', {hashes: [sha]})).missing, [sha]);
  ok(await a.call('PUT', 'v1/assets/' + '0'.repeat(64), pdf, {raw: true}), 422);
  ok(await a.call('PUT', 'v1/assets/' + crypto.createHash('sha256').update('<html>').digest('hex'), Buffer.from('<html>'), {raw: true}), 415);
  assert.strictEqual(ok(await a.call('PUT', 'v1/assets/' + sha, pdf, {raw: true})).mime, 'application/pdf');
  assert.deepStrictEqual(ok(await a.call('POST', 'v1/assets/missing', {hashes: [sha]})).missing, []);
  // Проект: создание, конфликт версий, список
  const doc = {format: 'xsatsu-doc', version: 1, id: 'doc-test-1', title: 'Дипломы 2026', kind: 'diploma', page: {width: 210, height: 297}, sides: [{id: 'front', elements: []}],
    data: {columns: [{id: 'c1', name: 'ФИО'}], rows: [{id: 'r1', cells: {c1: 'Иванов'}}]}, assets: {a1: {id: 'a1', name: 'фон.pdf', mime: 'application/pdf', data: '', sha256: sha}}, fonts: []};
  ok(await a.call('POST', 'v1/projects', {doc: {...doc, assets: {a1: {...doc.assets.a1, sha256: 'f'.repeat(64)}}}}), 422);
  const created = ok(await a.call('POST', 'v1/projects', {doc, thumb: 'data:image/jpeg;base64,AAAA'}));
  assert.strictEqual(created.id, 'doc-test-1'); assert.strictEqual(created.revision, 1);
  const dup = ok(await b.call('POST', 'v1/projects', {doc: {...doc, assets: {}}})); // тот же id у другого человека → новый id
  assert.notStrictEqual(dup.id, 'doc-test-1');
  let list = ok(await a.call('GET', 'v1/projects')).projects;
  assert.strictEqual(list.length, 1); assert.strictEqual(list[0].rows, 1); assert.strictEqual(list[0].thumb, 'data:image/jpeg;base64,AAAA');
  const saved = ok(await a.call('PUT', 'v1/projects/doc-test-1', {doc: {...doc, title: 'Дипломы v2'}, revision: 1}));
  assert.strictEqual(saved.revision, 2);
  const conflict = await a.call('PUT', 'v1/projects/doc-test-1', {doc, revision: 1});
  assert.strictEqual(conflict.status, 409); assert.strictEqual(conflict.data.revision, 2); assert.strictEqual(conflict.data.updatedBy, 'Артём');
  // Чужой проект не виден, доступ по логину
  ok(await b.call('GET', 'v1/projects/doc-test-1'), 404);
  ok(await b.call('GET', 'v1/assets/' + sha), 404);
  ok(await a.call('POST', 'v1/projects/doc-test-1/shares', {login: 'maria', permission: 'view'}));
  assert.strictEqual(ok(await b.call('GET', 'v1/projects&scope=shared')).projects.length, 1);
  assert.strictEqual(ok(await b.call('GET', 'v1/projects/doc-test-1')).permission, 'view');
  ok(await b.call('PUT', 'v1/projects/doc-test-1', {doc, revision: 2}), 403);
  const file = ok(await b.call('GET', 'v1/assets/' + sha));
  assert.strictEqual(Buffer.from(file).toString('latin1').slice(0, 5), '%PDF-');
  ok(await a.call('POST', 'v1/projects/doc-test-1/shares', {login: 'maria', permission: 'edit'}));
  assert.strictEqual(ok(await b.call('PUT', 'v1/projects/doc-test-1', {doc: {...doc, title: 'Правка Марии'}, revision: 2})).revision, 3);
  // Версии и откат
  ok(await a.call('POST', 'v1/projects/doc-test-1/revisions', {note: 'Перед печатью'}));
  const revs = ok(await a.call('GET', 'v1/projects/doc-test-1/revisions')).revisions;
  assert.ok(revs.length >= 2 && revs[0].note === 'Перед печатью', JSON.stringify(revs));
  assert.strictEqual(ok(await a.call('GET', 'v1/projects/doc-test-1/revisions/1')).doc.title, 'Дипломы 2026');
  // Ссылка только для просмотра
  const link = ok(await a.call('POST', 'v1/projects/doc-test-1/shares', {link: true}));
  assert.ok(link.token);
  const viaLink = ok(await anon.call('GET', 'v1/links/' + link.token));
  assert.strictEqual(viaLink.permission, 'view'); assert.strictEqual(viaLink.doc.title, 'Правка Марии');
  ok(await anon.call('GET', 'v1/assets/' + sha + '&link=' + link.token));
  ok(await anon.call('GET', 'v1/assets/' + sha + '&link=wrong'), 404);
  ok(await anon.call('PUT', 'v1/link', {doc, revision: viaLink.revision}, {headers: {'X-XS-Link': link.token}}), 403); // просмотр — не правка
  // Гостевая ссылка с правкой: заголовок X-XS-Link, подпись «для кого», срок, учёт в версиях, отзыв
  ok(await b.call('POST', 'v1/projects/doc-test-1/shares', {link: true, permission: 'edit'}), 403); // Мария — редактор, но не владелец
  const guestLink = ok(await a.call('POST', 'v1/projects/doc-test-1/shares', {link: true, permission: 'edit', label: 'Для Петрова', days: 7}));
  assert.ok(guestLink.token.length >= 32, 'токен не короче 192 бит');
  const gl = guestLink.shares.find(s => s.link && s.permission === 'edit');
  assert.strictEqual(gl.label, 'Для Петрова'); assert.ok(gl.expiresAt); assert.strictEqual(gl.edits, 0);
  const guest = new Client(), gh = {headers: {'X-XS-Link': guestLink.token}};
  const g1 = ok(await guest.call('GET', 'v1/link', undefined, gh));
  assert.strictEqual(g1.permission, 'edit'); assert.strictEqual(g1.label, 'Для Петрова'); assert.strictEqual(g1.owner, 'Артём');
  ok(await guest.call('GET', 'v1/assets/' + sha, undefined, gh));
  ok(await guest.call('GET', 'v1/projects/doc-test-1', undefined, gh), 401); // ссылка не открывает остальное API
  // гость загружает новый файл и сохраняет правку
  const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('гостевая картинка')]);
  const pngSha = crypto.createHash('sha256').update(png).digest('hex');
  ok(await guest.call('POST', 'v1/assets/missing', {hashes: [pngSha]}), 401);
  assert.deepStrictEqual(ok(await guest.call('POST', 'v1/assets/missing', {hashes: [pngSha]}, gh)).missing, [pngSha]);
  ok(await guest.call('PUT', 'v1/assets/' + pngSha, png, {raw: true, headers: {'X-XS-Link': link.token}}), 403); // ссылка на просмотр не грузит файлы
  ok(await guest.call('PUT', 'v1/assets/' + pngSha, png, {raw: true, ...gh}));
  const gdoc = {...g1.doc, title: 'Правка гостя', assets: {...g1.doc.assets, a2: {id: 'a2', name: 'g.png', mime: 'image/png', data: '', sha256: pngSha}}};
  const gs = ok(await guest.call('PUT', 'v1/link', {doc: gdoc, revision: g1.revision, guest: '  Пётр <b>Петров</b> '}, gh));
  assert.strictEqual(gs.revision, g1.revision + 1);
  ok(await guest.call('PUT', 'v1/link', {doc: gdoc, revision: g1.revision}, gh), 409);
  const gconf = await a.call('PUT', 'v1/projects/doc-test-1', {doc, revision: g1.revision});
  assert.strictEqual(gconf.status, 409); assert.strictEqual(gconf.data.updatedBy, 'Пётр b Петров /b (гость)');
  assert.strictEqual(ok(await a.call('GET', 'v1/projects/doc-test-1')).doc.title, 'Правка гостя');
  const grevs = ok(await a.call('GET', 'v1/projects/doc-test-1/revisions')).revisions;
  assert.ok(grevs[0].guest && grevs[0].author.includes('(гость)') && grevs[0].revision === gs.revision, JSON.stringify(grevs.slice(0, 2)));
  assert.ok(grevs.some(r => r.revision === g1.revision && !r.guest), 'состояние до правки гостя сохранено версией');
  assert.strictEqual(ok(await a.call('GET', 'v1/projects/doc-test-1/shares')).shares.find(s => s.id === gl.id).edits, 1);
  // владелец сужает права и отзывает ссылку
  ok(await a.call('PATCH', 'v1/projects/doc-test-1/shares/' + gl.id, {permission: 'view', days: 1}));
  ok(await guest.call('PUT', 'v1/link', {doc: gdoc, revision: gs.revision}, gh), 403);
  ok(await a.call('DELETE', 'v1/projects/doc-test-1/shares/' + gl.id));
  ok(await guest.call('GET', 'v1/link', undefined, gh), 404);
  ok(await guest.call('GET', 'v1/assets/' + pngSha, undefined, gh), 404);
  // истёкшая ссылка не работает
  const exp = ok(await a.call('POST', 'v1/projects/doc-test-1/shares', {link: true, permission: 'edit'}));
  execFileSync('php', ['-r', `$p=new PDO(getenv('XS_DB_DSN'),getenv('XS_DB_USER'),getenv('XS_DB_PASSWORD'));$p->exec("UPDATE project_shares SET expires_at = '2000-01-01 00:00:00' WHERE token_hash = '${crypto.createHash('sha256').update(exp.token).digest('hex')}'");`], {env});
  ok(await guest.call('GET', 'v1/link', undefined, {headers: {'X-XS-Link': exp.token}}), 404);
  // перебор токенов ограничен по IP
  let limited = 0;
  for (let i = 0; i < 25; i++) if ((await anon.call('GET', 'v1/link', undefined, {headers: {'X-XS-Link': crypto.randomBytes(24).toString('base64url')}})).status === 429) limited++;
  assert.ok(limited > 0, 'после 20 неверных токенов — 429');
  ok(await anon.call('GET', 'v1/link', undefined, {headers: {'X-XS-Link': link.token}}), 429); // даже верный, пока не прошло окно
  execFileSync('php', ['-r', `$p=new PDO(getenv('XS_DB_DSN'),getenv('XS_DB_USER'),getenv('XS_DB_PASSWORD'));$p->exec("DELETE FROM rate_hits");`], {env});
  // Корзина
  ok(await b.call('DELETE', 'v1/projects/doc-test-1')); // не владелец — убирает у себя
  assert.strictEqual(ok(await b.call('GET', 'v1/projects&scope=shared')).projects.length, 0);
  ok(await a.call('DELETE', 'v1/projects/doc-test-1'));
  assert.strictEqual(ok(await a.call('GET', 'v1/projects&scope=trash')).projects.length, 1);
  ok(await a.call('POST', 'v1/projects/doc-test-1/restore'));
  ok(await a.call('DELETE', 'v1/projects/doc-test-1&purge=1'), 409);
  // v4: анкета регистрации — гость отвечает без входа, владелец забирает ответы и отмечает перенесёнными
  ok(await a.call('POST', 'v1/projects/doc-test-1/forms', {fields: []}), 422);
  const fc = ok(await a.call('POST', 'v1/projects/doc-test-1/forms', {title: 'Регистрация', intro: 'Заполните', fields: [{column: 'ФИО', required: true}, {column: 'Email', type: 'email'}, {column: 'Секция', type: 'choice', options: ['A', 'B']}, {column: 'ФИО', label: 'повтор'}]}));
  assert.ok(fc.token); const form = fc.forms[0];
  assert.strictEqual(form.fields.length, 3, 'повтор столбца убран'); assert.strictEqual(form.pending, 0);
  const pub = ok(await anon.call('GET', 'v1/f/' + fc.token));
  assert.strictEqual(pub.fields.length, 3); assert.ok(pub.open); assert.strictEqual(pub.token, undefined, 'гость не видит служебное');
  ok(await anon.call('POST', 'v1/f/' + fc.token, {answers: {Email: 'x@y.ru'}}), 422);
  ok(await anon.call('POST', 'v1/f/' + fc.token, {answers: {'ФИО': 'Гость', Email: 'bad'}}), 422);
  ok(await anon.call('POST', 'v1/f/' + fc.token, {answers: {'ФИО': 'Гость', 'Секция': 'C'}}), 422);
  ok(await anon.call('POST', 'v1/f/' + fc.token, {answers: {'ФИО': 'Петрова Анна', Email: 'anna@example.com', 'Секция': 'B', 'Лишнее': 'x'}}));
  ok(await anon.call('POST', 'v1/f/' + fc.token, {answers: {'ФИО': 'Бот'}, website: 'spam'})); // ловушка: «принято», но не сохранено
  ok(await b.call('GET', 'v1/projects/doc-test-1/forms/' + form.id + '/responses'), 404);
  let resp = ok(await a.call('GET', 'v1/projects/doc-test-1/forms/' + form.id + '/responses&pending=1')).responses;
  assert.deepStrictEqual(resp.map(r => r.answers), [{'ФИО': 'Петрова Анна', Email: 'anna@example.com', 'Секция': 'B'}]);
  assert.strictEqual(ok(await a.call('POST', 'v1/projects/doc-test-1/forms/' + form.id + '/ack', {ids: resp.map(r => r.id)})).marked, 1);
  assert.strictEqual(ok(await a.call('GET', 'v1/projects/doc-test-1/forms/' + form.id + '/responses&pending=1')).responses.length, 0);
  ok(await a.call('PATCH', 'v1/projects/doc-test-1/forms/' + form.id, {isOpen: false}));
  ok(await anon.call('POST', 'v1/f/' + fc.token, {answers: {'ФИО': 'Поздно'}}), 410);
  assert.strictEqual(ok(await anon.call('GET', 'v1/f/' + fc.token)).open, false);
  assert.strictEqual(ok(await a.call('GET', 'v1/projects/doc-test-1/forms')).forms[0].responses, 1);
  ok(await a.call('DELETE', 'v1/projects/doc-test-1/forms/' + form.id));
  ok(await anon.call('GET', 'v1/f/' + fc.token), 404);
  // Настройки
  const s = ok(await b.call('PUT', 'v1/settings/user', {prefs: {theme: 'dark'}, printers: [{id: 'p1', name: 'HP'}]}));
  assert.strictEqual(s.user.prefs.theme, 'dark');
  ok(await b.call('PUT', 'v1/settings/user', {secret: 1}), 422);
  ok(await b.call('PUT', 'v1/settings/system', {registration: 'open'}), 403);
  assert.strictEqual(ok(await a.call('PUT', 'v1/settings/system', {registration: 'closed'})).system.registration, 'closed');
  ok(await new Client().call('POST', 'v1/auth/register', {login: 'late', password: 'password3'}), 403);
  // Вход, неверный пароль, блокировка, смена пароля
  const c = new Client();
  ok(await c.call('POST', 'v1/auth/login', {login: 'maria', password: 'nope'}), 401);
  ok(await c.call('POST', 'v1/auth/login', {login: 'MARIA', password: 'password2'}));
  ok(await c.call('PATCH', 'v1/auth/me', {password: 'bad', newPassword: 'password9'}), 403);
  ok(await c.call('PATCH', 'v1/auth/me', {password: 'password2', newPassword: 'password9'}));
  assert.strictEqual(ok(await b.call('GET', 'v1/auth/state')).user, null, 'остальные сессии закрыты при смене пароля');
  const users = ok(await a.call('GET', 'v1/admin/users')).users;
  const maria = users.find(u => u.login === 'maria');
  ok(await a.call('PATCH', 'v1/admin/users/' + maria.id, {status: 'blocked'}));
  assert.strictEqual(ok(await c.call('GET', 'v1/auth/state')).user, null);
  ok(await a.call('PATCH', 'v1/admin/users/' + users.find(u => u.login === 'admin').id, {role: 'user'}), 422);
  const stats = ok(await a.call('GET', 'v1/admin/stats'));
  assert.ok(stats.projects >= 1 && stats.assets === 2, JSON.stringify(stats)) // PDF владельца + картинка гостя;
  assert.ok(ok(await a.call('GET', 'v1/admin/audit')).events.some(e => e.action === 'project.share'));
  // Админка 4.2: обзор, карточка пользователя, временный пароль, сеансы, квота, удаление с передачей проектов, приглашения, журнал, сервер
  const ov = ok(await a.call('GET', 'v1/admin/overview'));
  assert.ok(ov.counts.users >= 2 && ov.activity.length === 14 && Array.isArray(ov.warnings), JSON.stringify(ov).slice(0, 300));
  ok(await b.call('GET', 'v1/admin/overview'), 401);
  ok(await a.call('PATCH', 'v1/admin/users/' + maria.id, {status: 'active'}));
  const mcard = ok(await a.call('GET', 'v1/admin/users/' + maria.id));
  assert.ok(mcard.user.used > 0 && mcard.projects.length >= 1, 'у Марии есть проект (копия с тем же id)');
  const reset = ok(await a.call('POST', 'v1/admin/users/' + maria.id + '/reset-password'));
  assert.ok(reset.password.length >= 12);
  ok(await c.call('POST', 'v1/auth/login', {login: 'maria', password: 'password9'}), 401);
  st = ok(await c.call('POST', 'v1/auth/login', {login: 'maria', password: reset.password}));
  assert.strictEqual(st.user.mustChangePassword, true);
  const blockedWrite = await c.call('PUT', 'v1/settings/user', {prefs: {}});
  assert.strictEqual(blockedWrite.status, 403); assert.ok(blockedWrite.data.mustChangePassword);
  ok(await c.call('PATCH', 'v1/auth/me', {password: reset.password, newPassword: reset.password}), 422);
  st = ok(await c.call('PATCH', 'v1/auth/me', {password: reset.password, newPassword: 'password10'}));
  assert.strictEqual(st.user.mustChangePassword, false);
  ok(await c.call('PUT', 'v1/settings/user', {prefs: {}}));
  // Сеансы: завершить все
  assert.ok(ok(await a.call('GET', 'v1/admin/users/' + maria.id)).sessions.length >= 1);
  assert.ok(ok(await a.call('DELETE', 'v1/admin/users/' + maria.id + '/sessions')).ended >= 1);
  assert.strictEqual(ok(await c.call('GET', 'v1/auth/state')).user, null);
  // Блокировка с причиной — причина видна при входе
  ok(await a.call('PATCH', 'v1/admin/users/' + maria.id, {status: 'blocked', reason: 'выпускница'}));
  assert.ok(/выпускница/.test(ok(await c.call('POST', 'v1/auth/login', {login: 'maria', password: 'password10'}), 403).error));
  ok(await a.call('PATCH', 'v1/admin/users/' + maria.id, {status: 'active'}));
  // Квота: 0 МБ у Марии = без ограничения; 1 МБ при большом проекте — отказ 413
  const big = {...doc, id: 'doc-big', assets: {}, data: {columns: [{id: 'c1', name: 'ФИО'}], rows: Array.from({length: 300}, (_, i) => ({id: 'r' + i, cells: {c1: 'x'.repeat(4000)}}))}};
  ok(await a.call('PATCH', 'v1/admin/users/' + maria.id, {quotaMb: 1}));
  ok(await c.call('POST', 'v1/auth/login', {login: 'maria', password: 'password10'}));
  const over = await c.call('POST', 'v1/projects', {doc: big});
  assert.strictEqual(over.status, 413); assert.ok(over.data.quota);
  ok(await a.call('PATCH', 'v1/admin/users/' + maria.id, {quotaMb: 'abc'}), 422);
  ok(await a.call('PATCH', 'v1/admin/users/' + maria.id, {quotaMb: null}));
  const mariaDoc = ok(await c.call('POST', 'v1/projects', {doc: {...doc, id: 'doc-maria', assets: {}}}));
  // Создание с временным паролем, последний админ, удаление
  const created2 = ok(await a.call('POST', 'v1/admin/users', {login: 'petr', name: 'Пётр', role: 'user', note: 'кафедра', quotaMb: 50}));
  assert.ok(created2.created.password && created2.created.mustChange);
  const petr = created2.users.find(u => u.login === 'petr');
  assert.strictEqual(petr.quotaMb, 50); assert.strictEqual(petr.note, 'кафедра');
  const adminId = users.find(u => u.login === 'admin').id;
  ok(await a.call('DELETE', 'v1/admin/users/' + adminId), 422);
  ok(await a.call('DELETE', 'v1/admin/users/' + maria.id), 409);
  ok(await a.call('DELETE', 'v1/admin/users/' + maria.id + '&projects=transfer&to=' + maria.id), 422);
  ok(await a.call('DELETE', 'v1/admin/users/' + maria.id + '&projects=transfer&to=' + petr.id));
  assert.ok(ok(await a.call('GET', 'v1/admin/users/' + petr.id)).projects.some(p => p.id === mariaDoc.id), 'проекты Марии у Петра');
  assert.strictEqual(ok(await c.call('GET', 'v1/auth/state')).user, null);
  // Приглашение на несколько человек; отзыв гасит остаток
  ok(await a.call('PUT', 'v1/settings/system', {registration: 'invite'}));
  const multi = ok(await a.call('POST', 'v1/admin/invites', {note: 'группа', maxUses: 2, days: 3}));
  ok(await new Client().call('POST', 'v1/auth/register', {invite: multi.code.toLowerCase(), login: 'stud1', password: 'password1'}));
  const invRow = ok(await a.call('GET', 'v1/admin/invites')).invites.find(i => i.note === 'группа');
  assert.strictEqual(invRow.uses, 1); assert.strictEqual(invRow.state, 'active');
  ok(await a.call('DELETE', 'v1/admin/invites/' + invRow.id));
  ok(await new Client().call('POST', 'v1/auth/register', {invite: multi.code, login: 'stud2', password: 'password1'}), 403);
  // Журнал: фильтры, страницы, CSV
  const j1 = ok(await a.call('GET', 'v1/admin/audit&action=user.*&limit=10'));
  assert.ok(j1.events.length && j1.events.every(e => e.action.startsWith('user.')) && j1.actions.includes('login'));
  const j2 = ok(await a.call('GET', 'v1/admin/audit&limit=10'));
  if (j2.next) assert.ok(ok(await a.call('GET', 'v1/admin/audit&limit=10&before=' + j2.next)).events.every(e => e.id < j2.next));
  assert.ok(ok(await a.call('GET', 'v1/admin/audit&actor=admin&q=petr')).events.some(e => e.action === 'user.create'));
  const csv = await a.call('GET', 'v1/admin/audit&format=csv&action=user.create');
  assert.strictEqual(csv.status, 200); assert.ok(Buffer.from(csv.data).toString().includes('petr'));
  // Админка: проекты, передача, ссылки, анкеты, хранилище
  const ap = ok(await a.call('GET', 'v1/admin/projects&q=doc-test-1'));
  assert.ok(ap.total >= 1 && ap.projects[0].owner.login, JSON.stringify(ap).slice(0, 200));
  const own = ap.projects.find(x => x.id === 'doc-test-1');
  assert.ok(own && own.files > 0 && own.people >= 0);
  ok(await a.call('GET', 'v1/admin/projects&sort=size&scope=all'));
  ok(await a.call('POST', 'v1/admin/projects/doc-test-1/transfer', {to: petr.id}));
  assert.strictEqual(ok(await a.call('GET', 'v1/admin/projects&owner=' + petr.id)).projects.some(x => x.id === 'doc-test-1'), true);
  assert.strictEqual(ok(await a.call('GET', 'v1/projects/doc-test-1')).permission, 'owner', 'админ видит всё');
  ok(await a.call('POST', 'v1/admin/projects/doc-test-1/transfer', {to: adminId}));
  const links = ok(await a.call('GET', 'v1/admin/links&kind=link&state=all')).items;
  assert.ok(links.length >= 1 && links[0].project.title);
  ok(await a.call('PATCH', 'v1/admin/links/' + links[0].id, {days: 7, permission: 'view'}));
  ok(await a.call('DELETE', 'v1/admin/links/' + links[0].id));
  ok(await a.call('DELETE', 'v1/admin/links/' + links[0].id), 404);
  ok(await a.call('GET', 'v1/admin/links&kind=user'));
  ok(await a.call('GET', 'v1/admin/links&kind=form&state=all'));
  ok(await a.call('POST', 'v1/admin/links/purge-expired'));
  const stor = ok(await a.call('GET', 'v1/admin/storage'));
  assert.ok(stor.users.length >= 2 && stor.totals.files > 0 && stor.bigProjects.length >= 1 && stor.types.length >= 1, JSON.stringify(stor).slice(0, 300));
  ok(await a.call('POST', 'v1/admin/trash/empty'));
  ok(await anon.call('GET', 'v1/admin/storage'), 401);
  // Библиотека сайта: шаблон из проекта (без личных строк), скачивание файлов шаблона без входа, шрифты сайта
  assert.deepStrictEqual(ok(await anon.call('GET', 'v1/templates')).templates, []);
  ok(await b.call('POST', 'v1/admin/templates', {projectId: 'doc-test-1'}), 401);
  const tplPub = ok(await a.call('POST', 'v1/admin/templates', {projectId: 'doc-test-1', title: 'Диплом кафедры', description: 'Официальный бланк'}));
  const tpl = ok(await anon.call('GET', 'v1/templates')).templates;
  assert.strictEqual(tpl.length, 1); assert.strictEqual(tpl[0].title, 'Диплом кафедры');
  const tdoc = ok(await anon.call('GET', 'v1/templates/' + tplPub.id)).doc;
  assert.strictEqual(tdoc.data.rows.length, 1); assert.strictEqual(Object.values(tdoc.data.rows[0].cells).join(''), '', 'имена из таблицы в шаблон не попадают');
  assert.ok(!('id' in tdoc));
  const tsha = Object.values(tdoc.assets).map(x => x.sha256).find(Boolean);
  if (tsha) assert.strictEqual(ok(await anon.call('GET', 'v1/assets/' + tsha)).length > 0, true, 'файлы шаблона доступны всем');
  ok(await a.call('PATCH', 'v1/admin/templates/' + tplPub.id, {published: false}));
  assert.strictEqual(ok(await anon.call('GET', 'v1/templates')).templates.length, 0);
  ok(await anon.call('GET', 'v1/templates/' + tplPub.id), 404);
  if (tsha) ok(await anon.call('GET', 'v1/assets/' + tsha), 404);
  assert.strictEqual(ok(await a.call('PATCH', 'v1/admin/templates/' + tplPub.id, {published: true, refresh: true, title: 'Диплом'})).templates[0].title, 'Диплом');
  ok(await a.call('POST', 'v1/admin/templates/order', {ids: [tplPub.id]}));
  const fontBytes = Buffer.concat([Buffer.from([0, 1, 0, 0]), Buffer.alloc(200, 7)]);
  const fsha = crypto.createHash('sha256').update(fontBytes).digest('hex');
  ok(await a.call('POST', 'v1/admin/fonts', {sha256: fsha, family: 'Кафедральный', variant: 'regular'}), 422);
  ok(await a.call('PUT', 'v1/assets/' + fsha, fontBytes, {raw: true}));
  ok(await a.call('POST', 'v1/admin/fonts', {sha256: sha, family: 'Не шрифт'}), 415);
  const sf = ok(await a.call('POST', 'v1/admin/fonts', {sha256: fsha, family: 'Кафедральный', variant: 'regular', name: 'kaf.ttf'}));
  assert.strictEqual(sf.fonts[0].variants[0].variant, 'regular');
  assert.strictEqual(ok(await anon.call('GET', 'v1/fonts/site')).fonts[0].family, 'Кафедральный');
  assert.ok(ok(await anon.call('GET', 'v1/assets/' + fsha)).length === fontBytes.length, 'шрифт сайта доступен всем');
  ok(await a.call('DELETE', 'v1/admin/fonts/' + sf.fonts[0].variants[0].id));
  ok(await anon.call('GET', 'v1/assets/' + fsha), 404);
  // Сервер и обслуживание
  const srvInfo = ok(await a.call('GET', 'v1/admin/server'));
  assert.ok(srvInfo.database.bytes > 0 && srvInfo.disk.total > 0 && srvInfo.jobs.length === 2 && !('setup_token' in srvInfo.security), JSON.stringify(srvInfo).slice(0, 300));
  const cl = ok(await a.call('POST', 'v1/admin/maintenance/cleanup'));
  assert.ok(typeof cl.result.sessions === 'number');
  assert.strictEqual(ok(await a.call('GET', 'v1/admin/server')).jobs.find(j => j.name === 'cleanup').ok, true);
  // Режим обслуживания: пользователь не сохраняет, админ — да
  const p2 = new Client();
  ok(await p2.call('POST', 'v1/auth/login', {login: 'petr', password: created2.created.password}));
  ok(await p2.call('PATCH', 'v1/auth/me', {password: created2.created.password, newPassword: 'password11'}));
  ok(await a.call('PUT', 'v1/settings/system', {maintenance: true, maintenanceText: 'Обновляем сайт'}));
  const mt = await p2.call('PUT', 'v1/settings/user', {prefs: {}});
  assert.strictEqual(mt.status, 503); assert.strictEqual(mt.data.error, 'Обновляем сайт');
  ok(await a.call('PUT', 'v1/settings/user', {prefs: {}}));
  ok(await a.call('PUT', 'v1/settings/system', {maintenance: false}));
  ok(await p2.call('PUT', 'v1/settings/user', {prefs: {}}));
  ok(await a.call('POST', 'v1/auth/logout'));
  assert.strictEqual(ok(await a.call('GET', 'v1/auth/state')).user, null);
  ok(await anon.call('GET', 'v1/nothing'), 404);
  console.log('Все проверки API пройдены.');
})().catch(e => { console.error(e); console.error(srvLog.split('\n').filter(l => /error|warning|fatal/i.test(l)).slice(-20).join('\n')); process.exitCode = 1; }).finally(() => { srv.kill(); fs.rmSync(storage, {recursive: true, force: true}); });
