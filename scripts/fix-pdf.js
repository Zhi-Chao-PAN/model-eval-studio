const fs = require('fs');
let f = 'src/lib/file-parser.ts';
let content = fs.readFileSync(f, 'utf8');

// Replace the pdf-parse import line
content = content.replace(
  "import PdfParse from 'pdf-parse'",
  "import PdfParse from 'pdf-parse'\nconst pdfParseFn = (PdfParse as any).default || PdfParse"
);

// Also update the usage
content = content.replace(
  'const data = await PdfParse(buffer as any)',
  'const data = await pdfParseFn(buffer as any)'
);

fs.writeFileSync(f, content, 'utf8');
console.log('Fixed file-parser.ts');
console.log(fs.readFileSync(f, 'utf8').split('\n').slice(0, 15).join('\n'));
