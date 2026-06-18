const fs = require('fs');
const path = 'E:/projects/model-test-assistant/prisma/schema.prisma';

let schema = fs.readFileSync(path, 'utf-8');

// 改成 sqlite，本地开发用
schema = schema.replace('provider  = "postgresql"', 'provider  = "sqlite"');
schema = schema.replace('url       = env("DATABASE_URL")', 'url      = env("DATABASE_URL")');

// SQLite 不支持 enums 的部分特性，简化一下
// SQLite 不支持 DateTime 的某些 default，prisma 会自动处理

fs.writeFileSync(path, schema, 'utf-8');
console.log('schema updated for sqlite');
console.log(schema.slice(0, 200));
