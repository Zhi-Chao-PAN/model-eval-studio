const fs = require('fs');
const path = 'E:/projects/model-test-assistant/package.json';
let content = fs.readFileSync(path, 'utf-8');
// 去除 BOM
content = content.replace(/^\uFEFF/, '');
fs.writeFileSync(path, content, 'utf-8');
console.log('package.json fixed');
console.log(JSON.parse(content).scripts);
