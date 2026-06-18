const fs = require('fs');
const path = 'E:/projects/model-test-assistant/prisma/schema.prisma';

let schema = fs.readFileSync(path, 'utf-8');
schema = schema.replace('provider  = "sqlite"', 'provider  = "postgresql"');
fs.writeFileSync(path, schema, 'utf-8');
console.log('schema restored to postgres');
