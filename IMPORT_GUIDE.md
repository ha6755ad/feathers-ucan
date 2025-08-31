# Optimized Import Guide

This package now supports tree-shaking through granular imports. Instead of importing everything, you can import only what you need.

## Available Import Paths

### Full Package (imports everything)
```javascript
import * as feathersUcan from 'feathers-ucan';
// or
import { AuthService, ucanAuth, CoreCall } from 'feathers-ucan';
```

### Granular Imports (recommended for tree-shaking)

#### Authentication Service
```javascript
import { AuthService, NotAuthError } from 'feathers-ucan/auth-service';
import { UcanStrategy } from 'feathers-ucan/auth-service';
```

#### Core Functionality
```javascript
import { CoreCall, Id, NullableId, CallFindResult } from 'feathers-ucan/core';
```

#### Hooks
```javascript
import { 
  ucanAuth, 
  allUcanAuth, 
  noThrowAuth, 
  bareAuth,
  updateUcan 
} from 'feathers-ucan/hooks';

// Types for hooks
import { 
  UcanAuthConfig, 
  UcanAuthOptions, 
  UcanCap, 
  UcanAllArgs 
} from 'feathers-ucan/hooks';
```

#### Types Only (TypeScript)
```typescript
import type { AnyObj, HookContext } from 'feathers-ucan/types';
```

#### Utilities
```javascript
import { 
  loadExists, 
  setExists, 
  getExists, 
  existsPath 
} from 'feathers-ucan/utils';
```

## Bundle Size Benefits

Using granular imports can significantly reduce your bundle size:

- **Before**: Importing the full package (~8.4kB gzipped)
- **After**: Import only what you need (e.g., just hooks ~2-3kB estimated)

## Example Usage

```javascript
// Instead of importing everything:
// import { ucanAuth } from 'feathers-ucan';

// Import only the hooks you need:
import { ucanAuth, allUcanAuth } from 'feathers-ucan/hooks';
import { AnyObj } from 'feathers-ucan/types';

// Your code here...
```

This approach allows modern bundlers (webpack, rollup, etc.) to eliminate unused code during the build process.
