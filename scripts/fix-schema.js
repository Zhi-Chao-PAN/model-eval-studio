const fs = require('fs');
const p = 'E:/projects/model-test-assistant/prisma/schema.prisma';
let content = fs.readFileSync(p, 'utf-8');

// 给 provider 的值加引号
content = content.replace(/(provider\s*=\s*)(\w[\w-]*)/g, function(m, key, val) {
  return key + '"' + val + '"';
});

// 给 @relation 名字加引号
content = content.replace(/@relation\(([A-Za-z]\w*)/g, function(m, name) {
  return '@relation("' + name + '"';
});

// 默认值里的字符串加引号
content = content.replace(/(@default\()([A-Z]+)(\))/g, function(m, start, val, end) {
  return start + '"' + val + '"' + end;
});

fs.writeFileSync(p, content, 'utf-8');
console.log('schema fixed');
console.log(content.slice(0, 400));
