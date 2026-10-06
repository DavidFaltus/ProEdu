import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const srcDir = path.resolve('src');

test('No user-facing "SVG náhled", "SVG přehled", "SVG grafika", "Obsahuje SVG" in UI files', () => {
  const filesToCheck = [
    path.join(srcDir, 'pages', 'Practice.tsx'),
    path.join(srcDir, 'pages', 'LearningSheets.tsx'),
    path.join(srcDir, 'components', 'admin', 'PracticeManager.tsx'),
    path.join(srcDir, 'components', 'admin', 'MaterialsManager.tsx'),
    path.join(srcDir, 'components', 'admin', 'MaterialSelectorModal.tsx'),
    path.join(srcDir, 'components', 'admin', 'PdfSvgDropzone.tsx')
  ];

  const forbiddenStrings = [
    'SVG přehled',
    'svg přehled',
    'SVG grafika',
    'Obsahuje SVG',
    'Náhled SVG',
    'SVG Náhled',
    'SVG výuka'
  ];

  for (const file of filesToCheck) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf-8');
    for (const forbidden of forbiddenStrings) {
      assert.ok(
        !content.includes(forbidden),
        `File ${path.basename(file)} must not contain forbidden label: "${forbidden}"`
      );
    }
  }
});

test('No "Ukázková data" or sample seed button in Practice.tsx and PracticeManager.tsx', () => {
  const practiceContent = fs.readFileSync(path.join(srcDir, 'pages', 'Practice.tsx'), 'utf-8');
  assert.ok(!practiceContent.includes('Ukázková data'), 'Practice.tsx should not contain "Ukázková data" button');
  assert.ok(!practiceContent.includes('Nahrát ukázková témata'), 'Practice.tsx should not contain "Nahrát ukázková témata" button');

  const practiceManagerContent = fs.readFileSync(path.join(srcDir, 'components', 'admin', 'PracticeManager.tsx'), 'utf-8');
  assert.ok(!practiceManagerContent.includes('Ukázková data'), 'PracticeManager.tsx should not contain "Ukázková data" button');
  assert.ok(!practiceManagerContent.includes('handleSeedStarterData'), 'PracticeManager.tsx should not contain starter data button');
});

test('No global tutor tip textarea in PracticeManager.tsx', () => {
  const practiceManagerContent = fs.readFileSync(path.join(srcDir, 'components', 'admin', 'PracticeManager.tsx'), 'utf-8');
  assert.ok(!practiceManagerContent.includes('Tip lektora & časté chytáky'), 'PracticeManager.tsx must not contain global tutor tip label');
});

test('PracticeManager subtopic modal highlights creating "Studovat" section', () => {
  const practiceManagerContent = fs.readFileSync(path.join(srcDir, 'components', 'admin', 'PracticeManager.tsx'), 'utf-8');
  assert.ok(
    practiceManagerContent.includes('Vytváříte podtéma i interaktivní sekci "Studovat"'),
    'PracticeManager.tsx must prominently highlight creating the Studovat section'
  );
});
