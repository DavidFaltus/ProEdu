import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveCredentialToBrowser } from '../src/lib/credentialHelper';
import fs from 'node:fs';
import path from 'node:path';

test('saveCredentialToBrowser behaves safely when PasswordCredential is not present', async () => {
  await assert.doesNotReject(async () => {
    await saveCredentialToBrowser({ id: 'student@test.cz', password: 'secretpassword123' });
  });
});

test('saveCredentialToBrowser invokes navigator.credentials.store when supported', async () => {
  let storedCred: any = null;
  class MockPasswordCredential {
    id: string;
    password?: string;
    name?: string;
    constructor(data: any) {
      this.id = data.id;
      this.password = data.password;
      this.name = data.name;
    }
  }

  (globalThis as any).window = {
    PasswordCredential: MockPasswordCredential,
  };

  const originalCredentials = Object.getOwnPropertyDescriptor(globalThis.navigator, 'credentials');
  Object.defineProperty(globalThis.navigator, 'credentials', {
    value: {
      store: async (cred: any) => {
        storedCred = cred;
      },
    },
    configurable: true,
    writable: true,
  });

  try {
    await saveCredentialToBrowser({
      id: 'student@test.cz',
      password: 'password123',
      name: 'Jan Novák',
    });

    assert.ok(storedCred instanceof MockPasswordCredential);
    assert.equal(storedCred.id, 'student@test.cz');
    assert.equal(storedCred.password, 'password123');
    assert.equal(storedCred.name, 'Jan Novák');
  } finally {
    delete (globalThis as any).window;
    if (originalCredentials) {
      Object.defineProperty(globalThis.navigator, 'credentials', originalCredentials);
    } else {
      delete (globalThis.navigator as any).credentials;
    }
  }
});

test('AuthModal.tsx includes Google Password Manager autocomplete attributes and password reset trigger', () => {
  const filePath = path.resolve(process.cwd(), 'src/components/AuthModal.tsx');
  const content = fs.readFileSync(filePath, 'utf8');

  // Verify Google Password Manager attributes
  assert.ok(content.includes('autoComplete="username"'), 'AuthModal must have autoComplete="username" for email');
  assert.ok(content.includes('autoComplete={isLogin ? \'current-password\' : \'new-password\'}'), 'AuthModal must distinguish current-password and new-password');
  assert.ok(content.includes('autoComplete="new-password"'), 'AuthModal must have new-password for registration');
  assert.ok(content.includes('method="post"'), 'AuthModal must specify method="post" for credential detection');

  // Verify Password Reset flow
  assert.ok(content.includes('Zapomněli jste heslo?'), 'AuthModal must have "Zapomněli jste heslo?" link in login mode');
  assert.ok(content.includes('handlePasswordReset'), 'AuthModal must have handlePasswordReset handler');
  assert.ok(content.includes('resetPassword('), 'AuthModal must call resetPassword');
  assert.ok(content.includes('Obnovení hesla'), 'AuthModal must have "Obnovení hesla" title');
});

test('Login.tsx includes Google Password Manager autocomplete attributes and password reset trigger', () => {
  const filePath = path.resolve(process.cwd(), 'src/pages/Login.tsx');
  const content = fs.readFileSync(filePath, 'utf8');

  // Verify Google Password Manager attributes
  assert.ok(content.includes('autoComplete="username"'), 'Login.tsx must have autoComplete="username"');
  assert.ok(content.includes('autoComplete={isLogin ? \'current-password\' : \'new-password\'}'), 'Login.tsx must distinguish current-password and new-password');
  assert.ok(content.includes('method="post"'), 'Login.tsx must specify method="post"');

  // Verify Password Reset flow
  assert.ok(content.includes('Zapomněli jste heslo?'), 'Login.tsx must have "Zapomněli jste heslo?" link in login mode');
  assert.ok(content.includes('handlePasswordReset'), 'Login.tsx must have handlePasswordReset handler');
  assert.ok(content.includes('resetPassword('), 'Login.tsx must call resetPassword');
});
