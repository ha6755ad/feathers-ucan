import fs from 'fs';
import path from 'path';

const modules = ['auth-service', 'core', 'hooks', 'types', 'utils'];

// First, let's create proper JavaScript files by compiling each module individually
// using TypeScript compiler with proper settings
modules.forEach(module => {
  const srcDir = `src/${module}`;
  const outDir = `lib/${module}`;

  // Ensure the output directory exists
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Clean up any existing problematic files
  if (fs.existsSync(outDir)) {
    const contents = fs.readdirSync(outDir);
    contents.forEach(item => {
      const itemPath = path.join(outDir, item);
      if (fs.statSync(itemPath).isDirectory() && !item.endsWith('.d.ts')) {
        fs.rmSync(itemPath, { recursive: true, force: true });
      }
    });
  }

  // Create a simple JavaScript re-export file that imports from the main bundle
  // but only exports the specific items for this module
  let moduleExports = '';

  switch(module) {
    case 'auth-service':
      moduleExports = `// Auth Service Module
import { AuthService, NotAuthError, UcanStrategy } from '../index.module.js';
export { AuthService, NotAuthError, UcanStrategy };`;
      break;
    case 'core':
      moduleExports = `// Core Module
import { CoreCall } from '../index.module.js';
export { CoreCall };`;
      break;
    case 'hooks':
      moduleExports = `// Hooks Module
import {
  ucanAuth,
  allUcanAuth,
  noThrowAuth,
  bareAuth,
  updateUcan,
  anyAuth,
  noThrow
} from '../index.module.js';
export {
  ucanAuth,
  allUcanAuth,
  noThrowAuth,
  bareAuth,
  updateUcan,
  anyAuth,
  noThrow
};`;
      break;
    case 'types':
      moduleExports = `// Types Module - JavaScript doesn't support type exports
// Types are available through TypeScript declaration files
// This module exists for consistency but exports nothing at runtime
export {};`;
      break;
    case 'utils':
      moduleExports = `// Utils Module
import { loadExists, setExists, getExists, existsPath } from '../index.module.js';
export { loadExists, setExists, getExists, existsPath };`;
      break;
  }

  fs.writeFileSync(path.join(outDir, 'index.js'), moduleExports);

  // Create top-level re-export files
  const esContent = `export * from './${module}/index.js';`;
  fs.writeFileSync(path.join('lib', `${module}.js`), esContent);

  const cjsContent = `const mod = require('./${module}/index.js');
module.exports = mod;`;
  fs.writeFileSync(path.join('lib', `${module}.cjs`), cjsContent);

  console.log(`✅ Created ${module} module exports`);
});

console.log('✅ Created submodule export files');
