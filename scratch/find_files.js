import fs from 'fs';
import path from 'path';

console.log('--- Environment variables ---');
console.log(JSON.stringify(process.env, null, 2));

function walk(dir) {
  let results = [];
  try {
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      const fullPath = path.join(dir, file);
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch (e) {
        return;
      }
      if (stat && stat.isDirectory()) {
        const name = path.basename(fullPath);
        if (
          name !== 'node_modules' && 
          name !== '.git' && 
          name !== 'usr' && 
          name !== 'lib' && 
          name !== 'proc' && 
          name !== 'sys' && 
          name !== 'dev' &&
          name !== 'etc' &&
          name !== 'var' &&
          name !== 'run' &&
          name !== 'boot' &&
          name !== 'sbin' &&
          name !== 'bin'
        ) {
          results = results.concat(walk(fullPath));
        }
      } else {
        if (file.toLowerCase().endsWith('.png') || file.toLowerCase().endsWith('.jpg') || file.toLowerCase().endsWith('.jpeg')) {
          results.push(fullPath);
        }
      }
    });
  } catch (e) {
  }
  return results;
}

console.log('--- Scanning /tmp ---');
try {
  console.log('/tmp content:', fs.readdirSync('/tmp'));
} catch (e) {
  console.log('Failed to read /tmp:', e);
}

console.log('--- Scanning whole filesystem ---');
const allImages = walk('/');
console.log('Found any image files anywhere:', allImages);
