const fs = require('fs');

fs.cpSync('src/main/database/migrations', 'dist/main/database/migrations', { recursive: true });
fs.mkdirSync('dist/main/wasm', { recursive: true });
fs.cpSync('node_modules/sql.js/dist/sql-wasm.wasm', 'dist/main/wasm/sql-wasm.wasm');
fs.cpSync('src/main/update-window', 'dist/main/update-window', { recursive: true });
