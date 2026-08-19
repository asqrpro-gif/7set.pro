import fs from 'fs';
const html = fs.readFileSync('views/index.ejs', 'utf8');
const lines = html.split('\n');
lines.forEach((l, i) => {
    if (l.includes('<script') || l.includes('</script')) console.log(i + 1, l.trim());
});
