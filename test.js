const e = require('electron');
console.log('type:', typeof e);
console.log('keys:', JSON.stringify(Object.keys(e || {})));
console.log('app:', e.app);
