import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  readExcelFirstSheetRows,
  writeExcelWorkbookBuffer,
} from '../src/utils/excelWorkbook';

const ROOT = process.cwd();

function readText(relPath: string): string {
  return fs.readFileSync(path.resolve(ROOT, relPath), 'utf-8');
}

function parseSemverTuple(version: string): [number, number, number] {
  const match = version.match(/(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, `Invalid semver string: ${version}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isVersionGte(actual: string, minimum: string): boolean {
  const [aMaj, aMin, aPat] = parseSemverTuple(actual);
  const [mMaj, mMin, mPat] = parseSemverTuple(minimum);
  if (aMaj !== mMaj) return aMaj > mMaj;
  if (aMin !== mMin) return aMin > mMin;
  return aPat >= mPat;
}

function parseCspDirectives(csp: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of csp.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const spaceIdx = trimmed.indexOf(' ');
    if (spaceIdx === -1) {
      map.set(trimmed.toLowerCase(), '');
    } else {
      map.set(trimmed.slice(0, spaceIdx).toLowerCase(), trimmed.slice(spaceIdx + 1).trim());
    }
  }
  return map;
}

test('SEC-21 & INFO-01 & SEC-33: package.json removes xlsx, upgrades react-router-dom, overrides katex, moves dev tools, adds test:rules', () => {
  const pkg = JSON.parse(readText('package.json'));
  const deps: Record<string, string> = pkg.dependencies || {};
  const devDeps: Record<string, string> = pkg.devDependencies || {};

  // Vulnerable xlsx removed
  assert.equal('xlsx' in deps, false, 'xlsx must not be in dependencies');
  assert.equal('xlsx' in devDeps, false, 'xlsx must not be in devDependencies');
  assert.ok(deps['read-excel-file'], 'read-excel-file must be in dependencies');
  assert.ok(deps['write-excel-file'], 'write-excel-file must be in dependencies');

  // react-router-dom >= 7.18.2
  assert.ok(deps['react-router-dom'], 'react-router-dom must be in dependencies');
  assert.ok(
    isVersionGte(deps['react-router-dom'], '7.18.2'),
    `Expected react-router-dom >= 7.18.2, got ${deps['react-router-dom']}`
  );
  const installedRouterPkg = JSON.parse(
    readText('node_modules/react-router-dom/package.json')
  );
  assert.ok(
    isVersionGte(installedRouterPkg.version, '7.18.2'),
    `Expected installed react-router-dom >= 7.18.2, got ${installedRouterPkg.version}`
  );

  // katex override >= 0.19.0
  assert.ok(pkg.overrides?.katex, 'package.json overrides.katex must be defined');
  assert.ok(
    isVersionGte(pkg.overrides.katex, '0.19.0'),
    `Expected katex override >= 0.19.0, got ${pkg.overrides.katex}`
  );
  const installedKatexPkg = JSON.parse(readText('node_modules/katex/package.json'));
  assert.ok(
    isVersionGte(installedKatexPkg.version, '0.19.0'),
    `Expected installed katex >= 0.19.0, got ${installedKatexPkg.version}`
  );

  // INFO-01: dev tools moved out of dependencies
  assert.equal('concurrently' in deps, false, 'concurrently must not be in dependencies');
  assert.equal('shadcn' in deps, false, 'shadcn must not be in dependencies');
  assert.ok(devDeps['concurrently'], 'concurrently must be in devDependencies');
  assert.ok(devDeps['shadcn'], 'shadcn must be in devDependencies');

  // SEC-33: test:rules script runs real Firebase emulators with all 3 emulator test suites
  const testRulesScript: string = pkg.scripts?.['test:rules'] || '';
  assert.ok(testRulesScript.includes('firebase emulators:exec --only firestore,storage'));
  assert.ok(testRulesScript.includes('test/p0FirestoreRulesEmulator.test.ts'));
  assert.ok(testRulesScript.includes('test/p1RulesAndStorageEmulator.test.ts'));
  assert.ok(testRulesScript.includes('test/p2RulesAndSchemaEmulator.test.ts'));
});

test('SEC-16 & SEC-39 & INFO-02: firebase.json hardens CSP and adds HSTS, COOP, CORP', () => {
  const firebaseConfig = JSON.parse(readText('firebase.json'));
  const wildcardBlock = (firebaseConfig.hosting?.headers || []).find(
    (entry: { source?: string }) => entry.source === '**'
  );
  assert.ok(wildcardBlock, 'firebase.json must define hosting.headers for **');

  const headerMap = new Map<string, string>(
    (wildcardBlock.headers || []).map((h: { key: string; value: string }) => [
      h.key.toLowerCase(),
      h.value,
    ])
  );

  // SEC-39: HSTS, COOP, CORP
  const hsts = headerMap.get('strict-transport-security') || '';
  assert.ok(hsts.includes('max-age=63072000'), `HSTS missing max-age=63072000: ${hsts}`);
  assert.ok(hsts.includes('includeSubDomains'), `HSTS missing includeSubDomains: ${hsts}`);
  assert.ok(hsts.includes('preload'), `HSTS missing preload: ${hsts}`);

  assert.equal(headerMap.get('cross-origin-opener-policy'), 'same-origin-allow-popups');
  assert.equal(headerMap.get('cross-origin-resource-policy'), 'same-origin');

  // SEC-16: Hardened CSP
  const csp = headerMap.get('content-security-policy') || '';
  assert.ok(csp.length > 0, 'Content-Security-Policy header must be set');
  const directives = parseCspDirectives(csp);

  const scriptSrc = directives.get('script-src') || '';
  assert.ok(scriptSrc.includes("'self'"), 'script-src must include self');
  assert.equal(
    scriptSrc.includes("'unsafe-inline'"),
    false,
    `script-src must NOT contain 'unsafe-inline': ${scriptSrc}`
  );
  assert.equal(
    scriptSrc.includes("'unsafe-eval'"),
    false,
    `script-src must NOT contain 'unsafe-eval': ${scriptSrc}`
  );

  const formAction = directives.get('form-action') || '';
  assert.ok(formAction.includes("'self'"), 'form-action must allow self');
  assert.ok(
    formAction.includes('https://payments.comgate.cz'),
    'form-action must allow https://payments.comgate.cz'
  );
  assert.equal(
    directives.has('upgrade-insecure-requests'),
    true,
    'CSP must include upgrade-insecure-requests'
  );

  // No multi-tenant wildcard hosts anywhere in CSP
  for (const forbiddenWildcard of [
    '*.cloudfunctions.net',
    '*.firebaseapp.com',
    '*.firebaseio.com',
    '*.googleapis.com',
    '*.google-analytics.com',
    '*.analytics.google.com',
    '*.googletagmanager.com',
  ]) {
    assert.equal(
      csp.includes(forbiddenWildcard),
      false,
      `CSP must not contain broad wildcard ${forbiddenWildcard}`
    );
  }

  const connectSrc = directives.get('connect-src') || '';
  for (const requiredHost of [
    'https://gen-lang-client-0972842509.firebaseapp.com',
    'https://gen-lang-client-0972842509.web.app',
    'https://europe-west1-gen-lang-client-0972842509.cloudfunctions.net',
    'https://firestore.googleapis.com',
    'https://identitytoolkit.googleapis.com',
    'https://securetoken.googleapis.com',
    'https://firebasestorage.googleapis.com',
    'https://payments.comgate.cz',
  ]) {
    assert.ok(
      connectSrc.includes(requiredHost),
      `connect-src must include ${requiredHost}`
    );
  }

  const frameSrc = directives.get('frame-src') || '';
  assert.ok(frameSrc.includes('https://gen-lang-client-0972842509.firebaseapp.com'));
  assert.ok(frameSrc.includes('https://accounts.google.com'));
  assert.ok(frameSrc.includes('https://payments.comgate.cz'));
});

test('SEC-16: index.html has zero inline executable scripts and loads /gtag-init.js with SameSite=Lax;Secure', () => {
  const indexHtml = readText('index.html');
  assert.ok(
    indexHtml.includes('<script src="/gtag-init.js"></script>'),
    'index.html must load /gtag-init.js'
  );

  // Inspect every <script ...>...</script> tag in index.html
  const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(indexHtml)) !== null) {
    const attrs = match[1] || '';
    const body = (match[2] || '').trim();
    const isJsonLd = /type\s*=\s*["']application\/ld\+json["']/i.test(attrs);
    if (!isJsonLd) {
      assert.equal(
        body.length,
        0,
        `Found non-empty inline executable <script> body in index.html: ${body.slice(0, 80)}`
      );
    }
  }

  const gtagInit = readText('public/gtag-init.js');
  assert.ok(gtagInit.includes("gtag('config', 'G-5Y9V7DHPXW'"));
  assert.ok(gtagInit.includes('send_page_view: false'));
  assert.ok(gtagInit.includes("cookie_flags: 'SameSite=Lax;Secure'"));
});

test('SEC-41: Android / Capacitor configs are hardened for release', () => {
  const manifest = readText('android/app/src/main/AndroidManifest.xml');
  assert.ok(manifest.includes('android:allowBackup="false"'));
  assert.equal(manifest.includes('android:allowBackup="true"'), false);

  const buildGradle = readText('android/app/build.gradle');
  const releaseBlockMatch = buildGradle.match(/release\s*\{[\s\S]*?\}/);
  assert.ok(releaseBlockMatch, 'release buildType block must exist in android/app/build.gradle');
  const releaseBlock = releaseBlockMatch[0];
  assert.ok(releaseBlock.includes('minifyEnabled true'));
  assert.ok(releaseBlock.includes('shrinkResources true'));
  assert.equal(releaseBlock.includes('minifyEnabled false'), false);

  const configXml = readText('android/app/src/main/res/xml/config.xml');
  assert.ok(configXml.includes('<access origin="https://www.proeducator.eu" />'));
  assert.equal(configXml.includes('origin="*"'), false);

  const filePathsXml = readText('android/app/src/main/res/xml/file_paths.xml');
  assert.equal(filePathsXml.includes('<external-path'), false);
  assert.equal(filePathsXml.includes('path="."'), false);
  assert.ok(filePathsXml.includes('<files-path') || filePathsXml.includes('<cache-path'));
});

test('SEC-43: static public/sitemap-courses.xml is removed and not generated by scripts/generate-sitemap.mjs', () => {
  assert.equal(
    fs.existsSync(path.resolve(ROOT, 'public/sitemap-courses.xml')),
    false,
    'public/sitemap-courses.xml must be deleted so dynamic rewrite is not shadowed'
  );

  const sitemapScript = readText('scripts/generate-sitemap.mjs');
  assert.equal(sitemapScript.includes('sitemap-courses.xml'), false);

  const firebaseConfig = JSON.parse(readText('firebase.json'));
  const coursesRewrite = (firebaseConfig.hosting?.rewrites || []).find(
    (r: { source?: string }) => r.source === '/sitemap-courses.xml'
  );
  assert.ok(coursesRewrite, 'Dynamic /sitemap-courses.xml rewrite must remain in firebase.json');
  assert.equal(coursesRewrite.function?.functionId, 'api');
});

test('SEC-21: excelWorkbook round-trips Czech headers, empty cells, types, multi-sheet, and blocks prototype keys', async () => {
  const bytes = await writeExcelWorkbookBuffer([
    {
      name: 'Procvičování',
      headers: ['Předmět', 'Otázka', 'Počet', 'Aktivní', 'Poznámka', '__proto__', 'constructor'],
      rows: [
        ['Matematika', 'Kolik je 2 + 2?', 4, true, '', 'evil1', 'evil2'],
        ['Čeština', 'Doplň i/y: b_l', 1, false, null, 'evil3', 'evil4'],
        ['', '', null, undefined, '', '', ''], // fully empty row should be skipped on read
      ],
      colWidths: [14, 30, 10, 10, 20, 10, 10],
    },
    {
      name: 'Studovat',
      headers: ['Podtéma', 'Krok'],
      rows: [['Zlomky', 1]],
    },
  ]);

  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.byteLength > 100);
  // ZIP magic bytes 'PK'
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);

  const rows = await readExcelFirstSheetRows(bytes);
  assert.equal(rows.length, 2, 'Empty trailing row must be skipped');
  assert.equal(rows[0]['Předmět'], 'Matematika');
  assert.equal(rows[0]['Otázka'], 'Kolik je 2 + 2?');
  assert.equal(rows[0]['Počet'], 4);
  assert.equal(rows[0]['Aktivní'], true);
  assert.equal(rows[0]['Poznámka'], '', 'Empty cells must default to empty string');
  assert.equal(Object.prototype.hasOwnProperty.call(rows[0], '__proto__'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(rows[0], 'constructor'), false);

  assert.equal(rows[1]['Předmět'], 'Čeština');
  assert.equal(rows[1]['Aktivní'], false);
  assert.equal(rows[1]['Poznámka'], '');

  // Also test ArrayBuffer input and optional preferredSheetMatcher
  const arrayBuf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const studyRows = await readExcelFirstSheetRows(arrayBuf, (name) =>
    name.toLowerCase().includes('stud')
  );
  assert.equal(studyRows.length, 1);
  assert.equal(studyRows[0]['Podtéma'], 'Zlomky');
  assert.equal(studyRows[0]['Krok'], 1);

  await assert.rejects(
    () => writeExcelWorkbookBuffer([]),
    /At least one worksheet specification is required/
  );
});
