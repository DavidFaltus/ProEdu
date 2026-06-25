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
        stat = fs.lstatSync(fullPath);
      } catch (e) {
        return;
      }
      if (stat.isSymbolicLink()) {
        return;
      }
      if (stat.isDirectory()) {
        const name = path.basename(fullPath);
        if (name !== 'proc' && name !== 'sys' && name !== 'dev' && name !== 'node_modules' && name !== '.git') {
          results = results.concat(walk(fullPath));
        }
      } else {
        const ext = path.extname(file).toLowerCase();
        if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.svg') {
          results.push(fullPath);
        }
      }
    });
  } catch (e) {
  }
  return results;
}

console.log('--- Scanning entire filesystem for images ---');
const found = walk('/');
console.log('Total found:', found.length);
found.forEach(p => console.log(p));
