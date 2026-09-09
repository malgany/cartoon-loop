import 'fake-indexeddb/auto';
import { Blob, File } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { vi } from 'vitest';
vi.stubGlobal('Blob', Blob);
vi.stubGlobal('File', File);
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
