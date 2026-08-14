import '@testing-library/jest-dom/vitest';
import {cleanup} from '@testing-library/react';
import {afterEach} from 'vitest';
afterEach(()=>cleanup());
// jsdom ships no ResizeObserver; the reader measures its page count with one
globalThis.ResizeObserver??=class{observe(){}unobserve(){}disconnect(){}};
