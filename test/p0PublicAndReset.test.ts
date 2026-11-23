import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('SEC-18: publicly exposed answer bank xlsx files and unwatermarked sheet are removed from public/', () => {
  const removedFiles = [
    path.resolve(process.cwd(), 'public', 'ProEdu_Import_Procvicovani.xlsx'),
    path.resolve(process.cwd(), 'public', 'ProEdu_Import_Studovat.xlsx'),
    path.resolve(process.cwd(), 'public', 'materials', 'cz-shoda.svg'),
  ];

  for (const filePath of removedFiles) {
    assert.equal(
      fs.existsSync(filePath),
      false,
      `Sensitive file must not exist in public/: ${path.relative(process.cwd(), filePath)}`
    );
  }
});

test('SEC-18: src/types/index.ts no longer references removed /materials/cz-shoda.svg', () => {
  const typesPath = path.resolve(process.cwd(), 'src', 'types', 'index.ts');
  const typesContent = fs.readFileSync(typesPath, 'utf8');
  assert.equal(
    typesContent.includes('/materials/cz-shoda.svg'),
    false,
    'src/types/index.ts should not reference removed /materials/cz-shoda.svg'
  );
});

test('SEC-18: PracticeManager.tsx generates templates client-side without linking to deleted public/ xlsx files', () => {
  const managerPath = path.resolve(process.cwd(), 'src', 'components', 'admin', 'PracticeManager.tsx');
  const source = fs.readFileSync(managerPath, 'utf8');

  assert.doesNotMatch(
    source,
    /href=\{`\$\{import\.meta\.env\.BASE_URL\}ProEdu_Import_(?:Procvicovani|Studovat)\.xlsx`\}/,
    'PracticeManager.tsx must not link to deleted static public/ xlsx files'
  );
  assert.ok(
    source.includes('handleDownloadPracticeTemplate') && source.includes('handleDownloadStudyTemplate'),
    'PracticeManager.tsx must provide client-side template download handlers'
  );
});

test('SEC-27: ResetPassword.tsx strictly gates demo/test mode behind import.meta.env.DEV', () => {
  const resetPagePath = path.resolve(process.cwd(), 'src', 'pages', 'ResetPassword.tsx');
  const source = fs.readFileSync(resetPagePath, 'utf8');

  // Demo mode flag must require import.meta.env.DEV
  assert.match(
    source,
    /const\s+isDemo\s*=\s*(?:Boolean\()?\s*import\.meta\.env\.DEV\)?\s*&&\s*\(\s*searchParams\.get\('demo'\)\s*===\s*'true'\s*\|\|\s*searchParams\.get\('test'\)\s*===\s*'true'\s*\)/,
    'isDemo must be strictly gated behind import.meta.env.DEV'
  );

  // Demo submit branch must also be guarded with import.meta.env.DEV so Vite strips it in production
  assert.match(
    source,
    /if\s*\(\s*import\.meta\.env\.DEV\s*&&\s*isDemo\s*\)\s*\{[\s\S]*?Režim náhledu/,
    'Demo submit handler must be guarded by import.meta.env.DEV'
  );

  // Must not assign arbitrary ?email= directly without DEV + isDemo gating
  assert.doesNotMatch(
    source,
    /const\s+emailParam\s*=\s*searchParams\.get\('email'\)/,
    'Must not unconditionally read ?email= from URL searchParams'
  );
  assert.doesNotMatch(
    source,
    /useState\(\s*emailParam/,
    'Must not initialize state directly from unverified ?email= query param'
  );

  // ?email= reading must only occur when DEV && isDemo
  const emailParamReads = source.match(/searchParams\.get\('email'\)/g) || [];
  assert.ok(emailParamReads.length <= 1, 'Unexpected unguarded ?email= reads in ResetPassword.tsx');
  if (emailParamReads.length === 1) {
    assert.match(
      source,
      /import\.meta\.env\.DEV\)?\s*&&\s*isDemo\s*\?\s*\(searchParams\.get\('email'\)/,
      '?email= read must be gated behind import.meta.env.DEV && isDemo'
    );
  }

  // Real password reset flow must verify oobCode via Firebase and populate verifiedEmail from its result
  assert.ok(
    source.includes('verifyPasswordResetCode(auth, oobCode)'),
    'ResetPassword.tsx must verify oobCode with Firebase Auth'
  );
  assert.match(
    source,
    /verifyPasswordResetCode\(auth,\s*oobCode\)[\s\S]*?\.then\(\(email\)\s*=>\s*\{[\s\S]*?setVerifiedEmail\(email\)/,
    'verifiedEmail must be populated from Firebase verifyPasswordResetCode result'
  );
  assert.ok(
    source.includes('V odkazu chybí platný bezpečnostní kód pro obnovení hesla.'),
    'Missing oobCode must display the invalid-link error state'
  );
});
