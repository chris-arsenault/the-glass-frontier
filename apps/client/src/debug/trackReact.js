/* eslint-env browser */
/* global window, console */
import * as React from 'react';

if (import.meta.env.DEV) {
  const k = '__REACT_SEEN__';
  const s = (window[k] ||= []);
  s.push({ by: import.meta.url, stack: new Error().stack, react: React });
  const unique = new Set(s.map((x) => x.react));
  console.groupCollapsed(`[react-tracker] unique Reacts: ${unique.size}`);
  console.table(s.map((x, i) => ({ i, by: x.by })));
  console.log('last stack:\n', s.at(-1).stack);
  console.groupEnd();
}
