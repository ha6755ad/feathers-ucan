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

  // Create top-level .d.ts file that re-exports from nested index.d.ts
  const nestedDtsPath = path.join(outDir, 'index.d.ts');
  if (fs.existsSync(nestedDtsPath)) {
    const dtsContent = `export * from './${module}/index';`;
    fs.writeFileSync(path.join('lib', `${module}.d.ts`), dtsContent);
  }

  console.log(`✅ Created ${module} module exports`);
});

console.log('✅ Created submodule export files');

// Post-process: Remove problematic export {}; statements from .d.ts files
const problematicFiles = [
  'lib/core/methods.d.ts',
  'lib/auth-service/ucan-strategy.d.ts',
  'lib/hooks/ucan-auth.d.ts',
  'lib/scripts/gen-version.d.ts'
];

problematicFiles.forEach(filePath => {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;

    // Remove export {}; statements (with optional semicolon and whitespace)
    content = content.replace(/^export \{\};?\s*$/gm, '');

    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Removed empty export from ${filePath}`);
    }
  }
});

// Fix duplicate AnyObj export by converting import to import type
const duplicateTypeFiles = [
  'lib/core/methods.d.ts',
  'lib/hooks/ucan-auth.d.ts'
];

duplicateTypeFiles.forEach(filePath => {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;

    // Convert "import { AnyObj" to "import type { AnyObj" to prevent re-export
    content = content.replace(/^import \{ (AnyObj[^}]*) \} from/gm, 'import type { $1 } from');

    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Fixed duplicate type exports in ${filePath}`);
    }
  }
});

// Replace main index.d.ts with direct exports that TypeScript can resolve
const mainIndexDts = 'lib/index.d.ts';
if (fs.existsSync(mainIndexDts)) {
  // Use direct file path exports instead of directory re-exports
  const bundledContent = `export * from './auth-service/ucan-strategy';
export * from './core/methods';
export * from './hooks/ucan-auth';
export * from './hooks/update-ucan';
export * from './types/index';
export * from './utils/check-exists';
`;

  fs.writeFileSync(mainIndexDts, bundledContent, 'utf8');
  console.log(`✅ Generated bundled index.d.ts with direct file exports`);
}

console.log('✅ Cleaned up TypeScript declaration files');
