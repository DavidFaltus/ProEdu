import fs from 'fs';
import path from 'path';

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
        const lower = file.toLowerCase();
        if (lower.includes('logo') || lower.includes('trophy') || lower.includes('knihy') || lower.includes('book') || lower.includes('title')) {
          results.push(fullPath);
        }
      }
    });
  } catch (e) {
  }
  return results;
}

console.log('--- Searching for named files in / ---');
const found = walk('/');
console.log('Found matching files:', found);
