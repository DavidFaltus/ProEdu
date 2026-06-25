import fs from 'fs';
console.log('--- Checking public folder contents directly ---');
try {
  console.log('public:', fs.readdirSync('public'));
} catch (e) {
  console.log('Error listing public:', e);
}

try {
  console.log('public/foto:', fs.readdirSync('public/foto'));
} catch (e) {
  console.log('Error listing public/foto:', e);
}
