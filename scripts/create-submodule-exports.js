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
import { AuthService, NotAuthError, UcanStrategy } from '../index.modern.js';
export { AuthService, NotAuthError, UcanStrategy };`;
      break;
    case 'core':
      moduleExports = `// Core Module
import { CoreCall } from '../index.modern.js';
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
} from '../index.modern.js';
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
import { loadExists, setExists, getExists, existsPath } from '../index.modern.js';
export { loadExists, setExists, getExists, existsPath };`;
      break;
  }

  fs.writeFileSync(path.join(outDir, 'index.js'), moduleExports);

  // Create top-level re-export files
  const esContent = `export * from './${module}/index.js';`;
  fs.writeFileSync(path.join('lib', `${module}.js`), esContent);

  // Create CommonJS entry that re-exports from the CJS bundle directly
  let cjsContent = '';
  switch (module) {
    case 'auth-service':
      cjsContent = `"use strict";
const { AuthService, NotAuthError, UcanStrategy } = require('./index.cjs');
module.exports = { AuthService, NotAuthError, UcanStrategy };`;
      break;
    case 'core':
      cjsContent = `"use strict";
const { CoreCall } = require('./index.cjs');
module.exports = { CoreCall };`;
      break;
    case 'hooks':
      cjsContent = `"use strict";
const {
  ucanAuth,
  allUcanAuth,
  noThrowAuth,
  bareAuth,
  updateUcan,
  anyAuth,
  noThrow
} = require('./index.cjs');
module.exports = {
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
      // No runtime exports for types
      cjsContent = '"use strict"; module.exports = {};';
      break;
    case 'utils':
      cjsContent = `"use strict";
const { loadExists, setExists, getExists, existsPath } = require('./index.cjs');
module.exports = { loadExists, setExists, getExists, existsPath };`;
      break;
  }
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

// Fix duplicate exports by converting type-only imports to "import type"
const filesToFixImports = [
  'lib/auth-service/index.d.ts',
  'lib/core/methods.d.ts',
  'lib/hooks/ucan-auth.d.ts',
  'lib/utils/check-exists.d.ts'
];

filesToFixImports.forEach(filePath => {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;

    // Convert imports from ../types to "import type"
    content = content.replace(/^import \{ ([^}]*) \} from '\.\.\/types';?$/gm, (match, imports) => {
      return `import type { ${imports} } from '../types';`;
    });

    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Fixed imports in ${filePath}`);
    }
  }
});

console.log('✅ Converted type imports to prevent duplicate exports');

// Remove AnyObj type declarations and replace with 'any' directly
const filesToRemoveAnyObj = [
  'lib/core/methods.d.ts',
  'lib/hooks/ucan-auth.d.ts',
  'lib/utils/check-exists.d.ts',
  'lib/auth-service/index.d.ts'
];

filesToRemoveAnyObj.forEach(filePath => {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;

    // Remove the AnyObj type declaration line
    content = content.replace(/^type AnyObj = any;?\s*$/gm, '');

    // Replace all usages of AnyObj with any
    content = content.replace(/\bAnyObj\b/g, 'any');

    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Removed AnyObj from ${filePath}`);
    }
  }
});

console.log('✅ Cleaned up AnyObj type declarations');

// Replace main index.d.ts with proper re-exports for bundler module resolution
const mainIndexDts = 'lib/index.d.ts';
if (fs.existsSync(mainIndexDts)) {
  // Use proper export statements that work with bundler module resolution
  // TypeScript with bundler resolution expects explicit .js extensions in imports
  // but will resolve to .d.ts files automatically
  let bundledContent = '// Re-export all submodules for bundler compatibility\n\n';

  bundledContent += `export * from './types/index';\n`;
  bundledContent += `export * from './core/methods';\n`;
  bundledContent += `export * from './hooks/ucan-auth';\n`;
  bundledContent += `export * from './hooks/update-ucan';\n`;
  bundledContent += `export * from './utils/check-exists';\n`;
  bundledContent += `export * from './auth-service/index';\n`;

  fs.writeFileSync(mainIndexDts, bundledContent, 'utf8');
  console.log(`✅ Generated index.d.ts with proper re-exports`);
}

console.log('✅ Cleaned up TypeScript declaration files');
