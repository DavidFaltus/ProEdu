import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanStudyStep,
  normalizeSubtopicPayload,
  buildSubtopicUpdatePayload,
  mapDocToMaterial
} from '../src/services/practiceService';
import { isPdfResource, svgStringToDataUrl } from '../src/utils/pdfToSvg';
import { PracticeSubtopic } from '../src/types';

test('cleanStudyStep preserves chunked PDF/image metadata without undefined values', () => {
  const step = cleanStudyStep({
    title: '  Krok s PDF  ',
    content: '  Prostudujte vzorec v příloze  ',
    materialId: ' mat_123 ',
    fileUrl: ' /api/materials/mat_123/file ',
    pdfUrl: ' /api/materials/mat_123/file ',
    fileType: ' application/pdf ',
    originalName: ' vzorce.pdf '
  });

  assert.equal(step.title, 'Krok s PDF');
  assert.equal(step.materialId, 'mat_123');
  assert.equal(step.fileUrl, '/api/materials/mat_123/file');
  assert.equal(step.pdfUrl, '/api/materials/mat_123/file');
  assert.equal(step.fileType, 'application/pdf');
  assert.equal(step.originalName, 'vzorce.pdf');
  assert.equal('imageUrl' in step, false);
});

test('normalizeSubtopicPayload persists PDF attachment fields and truncates oversized thumbnailUrl', () => {
  const oversizedThumb = `data:image/jpeg;base64,${'A'.repeat(2500)}`;
  const payload = normalizeSubtopicPayload({
    title: 'Kvadratická rovnice',
    topicId: 'topic_kvadr',
    subjectId: 'Matematika',
    materialId: 'mat_pdf_1',
    fileUrl: '/api/materials/mat_pdf_1/file',
    pdfUrl: '/api/materials/mat_pdf_1/file',
    downloadUrl: '/api/materials/mat_pdf_1/download',
    thumbnailUrl: oversizedThumb,
    fileType: 'application/pdf',
    originalName: 'kvadraticka.pdf'
  });

  assert.equal(payload.hasStudyMaterial, true);
  assert.equal(payload.materialId, 'mat_pdf_1');
  assert.equal(payload.fileUrl, '/api/materials/mat_pdf_1/file');
  assert.equal(payload.pdfUrl, '/api/materials/mat_pdf_1/file');
  assert.equal(payload.downloadUrl, '/api/materials/mat_pdf_1/download');
  assert.equal(payload.fileType, 'application/pdf');
  assert.equal(payload.originalName, 'kvadraticka.pdf');
  assert.equal(payload.thumbnailUrl, null);
});

test('buildSubtopicUpdatePayload retains and explicitly clears media attachment fields safely', () => {
  const existing: PracticeSubtopic = {
    id: 'sub_pdf',
    title: 'Funkce',
    topicId: 'topic_fn',
    subjectId: 'Matematika',
    hasStudyMaterial: true,
    materialId: 'mat_1',
    fileUrl: '/api/materials/mat_1/file',
    pdfUrl: '/api/materials/mat_1/file',
    downloadUrl: '/api/materials/mat_1/download',
    thumbnailUrl: '/api/materials/mat_1/thumbnail',
    fileType: 'application/pdf',
    originalName: 'funkce.pdf',
    createdBy: 'teacher_1'
  };

  // Partial update of theory preserves attachment metadata
  const partialMerged = buildSubtopicUpdatePayload(existing, {
    studyTheory: 'Krátký popis funkce'
  });
  assert.equal(partialMerged.materialId, 'mat_1');
  assert.equal(partialMerged.pdfUrl, '/api/materials/mat_1/file');
  assert.equal(partialMerged.originalName, 'funkce.pdf');
  assert.equal(partialMerged.studyTheory, 'Krátký popis funkce');

  // Explicit clearing removes all file URLs while keeping title/topicId/createdBy
  const cleared = buildSubtopicUpdatePayload(existing, {
    materialId: null,
    fileUrl: null,
    pdfUrl: null,
    downloadUrl: null,
    thumbnailUrl: null,
    fileType: null,
    originalName: null,
    svgUrl: null,
    svgContent: null
  });
  assert.equal(cleared.materialId, null);
  assert.equal(cleared.pdfUrl, null);
  assert.equal(cleared.fileUrl, null);
  assert.equal(cleared.hasStudyMaterial, false);
  assert.equal(cleared.createdBy, 'teacher_1');
});

test('mapDocToMaterial classifies PDF vs SVG, respects hiddenFromLibrary, and keeps cleared files null', () => {
  const pdfDoc = mapDocToMaterial('mat_pdf', {
    title: 'Pythagorova věta',
    subject: 'Matematika',
    topic: 'Geometrie',
    studyTheory: 'Výklad v horním poli',
    hiddenFromLibrary: true,
    fileType: 'application/pdf',
    originalName: 'pythagoras.pdf',
    fileUrl: '/api/materials/mat_pdf/file',
    status: 'processing'
  });

  assert.equal(pdfDoc.hiddenFromLibrary, true);
  assert.equal(pdfDoc.status, 'processing');
  assert.equal(pdfDoc.pdfUrl, '/api/materials/mat_pdf/file');
  assert.equal(pdfDoc.svgUrl, null);
  assert.equal(pdfDoc.studyTheory, 'Výklad v horním poli');

  const clearedDoc = mapDocToMaterial('mat_text_only', {
    title: 'Jen text',
    studyTheory: 'Definice',
    fileUrl: null,
    pdfUrl: null,
    svgUrl: null,
    downloadUrl: null,
    thumbnailUrl: null,
    fileType: null
  });

  assert.equal(clearedDoc.hiddenFromLibrary, false);
  assert.equal(clearedDoc.fileUrl, null);
  assert.equal(clearedDoc.pdfUrl, null);
  assert.equal(clearedDoc.svgUrl, null);
  assert.equal(clearedDoc.thumbnailUrl, null);
});

test('isPdfResource classifies converted SVG chunks vs legacy raw PDF accurately', () => {
  // Converted PDF stored in chunks as image/svg+xml even when originalName ends with .pdf
  assert.equal(
    isPdfResource({
      fileType: 'image/svg+xml',
      originalName: 'vzorce.pdf',
      fileUrl: '/api/materials/mat_svg_1/file',
      svgContent: null
    }),
    false
  );

  // Explicit raw PDF stored as application/pdf
  assert.equal(
    isPdfResource({
      fileType: 'application/pdf',
      originalName: 'test.pdf',
      fileUrl: '/api/materials/mat_pdf_1/file'
    }),
    true
  );

  // Raster image upload in chunks
  assert.equal(
    isPdfResource({
      fileType: 'image/png',
      originalName: 'nakres.png',
      fileUrl: '/api/materials/mat_img_1/file'
    }),
    false
  );

  // Legacy doc with svgUrl pointing to Storage or local public/materials/*.svg
  assert.equal(
    isPdfResource({
      svgUrl: '/materials/shoda.svg',
      fileUrl: '/materials/shoda.svg'
    }),
    false
  );
});

test('svgStringToDataUrl encodes Unicode SVG cleanly into Base64 Data URL', () => {
  const sampleSvg = '<svg xmlns="http://www.w3.org/2000/svg"><text>Příliš žluťoučký kůň</text></svg>';
  const dataUrl = svgStringToDataUrl(sampleSvg);
  assert.ok(dataUrl.startsWith('data:image/svg+xml;base64,'));
  const decoded = Buffer.from(dataUrl.replace('data:image/svg+xml;base64,', ''), 'base64').toString('utf8');
  assert.equal(decoded, sampleSvg);
});
