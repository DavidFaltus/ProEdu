import { test } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';

test('Materials chunking & background processing API flow', async (t) => {
  // Let's create a simulated base64 file payload (~500 KB to trigger multiple chunks)
  const simulatedFileSize = 500 * 1024;
  const rawBytes = Buffer.alloc(simulatedFileSize, 'A');
  const base64Data = rawBytes.toString('base64');
  const thumbBytes = Buffer.from('FAKE_JPEG_THUMBNAIL_BYTES', 'utf8');
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

  // 2. We need a valid teacher auth token. In dev mode, verifyIdToken falls back to JWT payload decode:
  const teacherPayload = {
    user_id: 'teacher-dev-uid',
    sub: 'teacher-dev-uid',
    email: 'ucitel@ucitel.cz',
    role: 'teacher'
  };
  const tokenHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64');
  const tokenPayload = Buffer.from(JSON.stringify(teacherPayload)).toString('base64');
  const mockTeacherToken = `${tokenHeader}.${tokenPayload}.signature`;

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

  assert.strictEqual(uploadRes.statusCode, 202, 'Upload endpoint should respond immediately with HTTP 202');
  const uploadResult = JSON.parse(uploadRes.data.toString('utf8'));
  assert.strictEqual(uploadResult.success, true);
  assert.strictEqual(uploadResult.status, 'processing', 'Status should immediately be "processing"');
  assert.ok(uploadResult.materialId, 'Response should contain materialId');
  const materialId = uploadResult.materialId;

  // 4. Wait for background processing to finish (poll thumbnail or file until ready, up to 10s)
  let isReady = false;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    const fileRes = await makeRequest({
      path: `/api/materials/${materialId}/file`,
      method: 'GET'
    });
    if (fileRes.statusCode === 200) {
      isReady = true;
      assert.strictEqual(fileRes.data.length, simulatedFileSize, 'Reassembled file length must match original file exactly');
      assert.strictEqual(fileRes.headers['content-type'], 'application/pdf');
      break;
    }
  }
  assert.ok(isReady, 'Material file should become ready after background processing');

  // 5. Test GET /api/materials/:id/thumbnail
  const thumbRes = await makeRequest({
    path: `/api/materials/${materialId}/thumbnail`,
    method: 'GET'
  });
  assert.strictEqual(thumbRes.statusCode, 200, 'Thumbnail should be accessible');
  assert.ok(thumbRes.headers['content-type']?.includes('image/'), 'Thumbnail should have image content-type');

  // 6. Test GET /api/materials/:id/download
  const downloadRes = await makeRequest({
    path: `/api/materials/${materialId}/download`,
    method: 'GET'
  });
  assert.strictEqual(downloadRes.statusCode, 200, 'Download should be accessible');
  assert.ok(downloadRes.headers['content-disposition']?.includes('attachment'), 'Content-Disposition must be attachment');

  // 7. Test DELETE /api/materials/:id
  const deleteRes = await makeRequest({
    path: `/api/materials/${materialId}`,
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${mockTeacherToken}`
    }
  });
  assert.strictEqual(deleteRes.statusCode, 200, 'Delete should return HTTP 200');
  const deleteResult = JSON.parse(deleteRes.data.toString('utf8'));
  assert.strictEqual(deleteResult.success, true);

  // 8. Verify it is no longer accessible
  const afterDeleteRes = await makeRequest({
    path: `/api/materials/${materialId}/file`,
    method: 'GET'
  });
  assert.strictEqual(afterDeleteRes.statusCode, 404, 'Deleted material file should return 404');
});
