const ejs = require('ejs');
const fs = require('fs');

try {
  const content = fs.readFileSync('views/diagnostic.ejs', 'utf-8');
  ejs.compile(content);
  console.log('✅ EJS syntax is VALID. The server will render this correctly.');
} catch (e) {
  console.error('❌ EJS syntax ERROR:', e.message);
}
