const fs = require('fs');
const code = fs.readFileSync('c:/laragon/www/7set.pro/routes/admin.js', 'utf8');
const lines = code.split('\n');
lines.forEach((line, i) => {
    if (line.toLowerCase().includes('limit')) console.log(i + 1, line.trim());
});
