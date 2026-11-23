import { test } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';

test('Materials chunking & background processing API flow', async (t) => {
  const teacherEmail = (process.env.TEST_TEACHER_EMAIL || '').trim();
  const teacherPassword = process.env.TEST_TEACHER_PASSWORD || '';
  const authEmulatorHost = (process.env.FIREBASE_AUTH_EMULATOR_HOST || '').trim();
  const allowIntegrationOptIn = process.env.RUN_MATERIALS_INTEGRATION_TEST === 'true';

  if (!teacherEmail || !teacherPassword || (!authEmulatorHost && !allowIntegrationOptIn)) {
    t.skip(
      'Skipping integration test: set TEST_TEACHER_EMAIL, TEST_TEACHER_PASSWORD, and FIREBASE_AUTH_EMULATOR_HOST (or RUN_MATERIALS_INTEGRATION_TEST=true).'
    );
    return;
  }

  // Let's create a simulated base64 file payload (~500 KB to trigger multiple chunks) with valid PDF magic bytes
  const simulatedFileSize = 500 * 1024;
  const rawBytes = Buffer.alloc(simulatedFileSize, 'A');
  rawBytes.write('%PDF-1.4\n', 0, 'latin1');
  const base64Data = rawBytes.toString('base64');
  const thumbBytes = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('FAKE_JPEG_THUMBNAIL_BYTES', 'utf8')]);
  const thumbBase64 = `data:image/jpeg;base64,${thumbBytes.toString('base64')}`;

  // Helper to make HTTP requests to local server on port 3005
  async function makeRequest(options: http.RequestOptions, body?: string): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; data: Buffer }> {
    return new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port: 3005,
        ...options
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            data: Buffer.concat(chunks)
          });
        });
      });
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }

  // 1. First, check server health
  const health = await makeRequest({ path: '/api/health', method: 'GET' });
  assert.strictEqual(health.statusCode, 200, 'Server should be reachable on port 3005');

  // 2. Sign in as teacher via Firebase Auth Emulator (or explicitly opted-in IdentityToolkit) using env credentials
  const appletCfg = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
  const authBaseUrl = authEmulatorHost
    ? `http://${authEmulatorHost}/identitytoolkit.googleapis.com/v1`
    : 'https://identitytoolkit.googleapis.com/v1';
  const authResp = await fetch(
    `${authBaseUrl}/accounts:signInWithPassword?key=${appletCfg.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: teacherEmail,
        password: teacherPassword,
        returnSecureToken: true,
      }),
    }
  );
  const authData: any = await authResp.json();
  assert.ok(authData.idToken, 'Should obtain valid Firebase ID token for configured teacher test account');
  const mockTeacherToken = authData.idToken;

  // 3. POST /api/materials/upload
  const uploadPayload = JSON.stringify({
    title: 'Test Matematika - Vzorce a rovnice',
    subject: 'Matematika',
    topic: 'Algebra',
    studyTheory: 'Základní vzorce pro lineární rovnice.',
    fileData: `data:application/pdf;base64,${base64Data}`,
    fileType: 'application/pdf',
    originalName: 'test_matematika.pdf',
    thumbnailDataUrl: thumbBase64
  });

  const uploadRes = await makeRequest({
    path: '/api/materials/upload',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${mockTeacherToken}`
    }
  }, uploadPayload);

  assert.ok([200, 201, 202].includes(uploadRes.statusCode), 'Upload endpoint should respond with HTTP 201/200/202');
  const uploadResult = JSON.parse(uploadRes.data.toString('utf8'));
  assert.strictEqual(uploadResult.success, true);
  assert.strictEqual(uploadResult.status, 'ready', 'Status should be "ready" once chunk processing completes before response (SEC-15)');
  assert.ok(uploadResult.materialId, 'Response should contain materialId');
  const materialId = uploadResult.materialId;

  // 4. Wait for background processing to finish (poll thumbnail or file until ready, up to 10s)
  const authHeaders = { 'Authorization': `Bearer ${mockTeacherToken}` };
  let isReady = false;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    const fileRes = await makeRequest({
      path: `/api/materials/${materialId}/file`,
      method: 'GET',
      headers: authHeaders
    });
    if (fileRes.statusCode === 200) {
      isReady = true;
      assert.strictEqual(fileRes.data.length, simulatedFileSize, 'Reassembled file length must match original file exactly');
      assert.strictEqual(fileRes.headers['content-type'], 'application/pdf');
      break;
    }
  }
  assert.ok(isReady, 'Material file should become ready after background processing');

  // 4b. Verify unauthenticated access to protected material file is blocked with 401
  const unauthFileRes = await makeRequest({
    path: `/api/materials/${materialId}/file`,
    method: 'GET'
  });
  assert.strictEqual(unauthFileRes.statusCode, 401, 'Unauthenticated material file request must return 401');

  // 5. Test GET /api/materials/:id/thumbnail
  const thumbRes = await makeRequest({
    path: `/api/materials/${materialId}/thumbnail`,
    method: 'GET',
    headers: authHeaders
  });
  assert.strictEqual(thumbRes.statusCode, 200, 'Thumbnail should be accessible');
  assert.ok(thumbRes.headers['content-type']?.includes('image/'), 'Thumbnail should have image content-type');

  // 6. Test GET /api/materials/:id/download
  const downloadRes = await makeRequest({
    path: `/api/materials/${materialId}/download`,
    method: 'GET',
    headers: authHeaders
  });
  assert.strictEqual(downloadRes.statusCode, 200, 'Download should be accessible');
  assert.ok(downloadRes.headers['content-disposition']?.includes('attachment'), 'Content-Disposition must be attachment');

  // 7. Test DELETE /api/materials/:id
  const deleteRes = await makeRequest({
    path: `/api/materials/${materialId}`,
    method: 'DELETE',
    headers: authHeaders
  });
  assert.strictEqual(deleteRes.statusCode, 200, 'Delete should return HTTP 200');
  const deleteResult = JSON.parse(deleteRes.data.toString('utf8'));
  assert.strictEqual(deleteResult.success, true);

  // 8. Verify it is no longer accessible
  const afterDeleteRes = await makeRequest({
    path: `/api/materials/${materialId}/file`,
    method: 'GET',
    headers: authHeaders
  });
  assert.strictEqual(afterDeleteRes.statusCode, 404, 'Deleted material file should return 404');
});
