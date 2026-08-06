import fs from 'fs';
import path from 'path';

const viewsDir = path.join(process.cwd(), 'views');
const ejsFiles = fs.readdirSync(viewsDir).filter(file => file.endsWith('.ejs'));

const replacementBlock = `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700;800&display=swap" rel="stylesheet">
  <link rel="preconnect" href="https://cdn.tailwindcss.com">
  <link rel="preconnect" href="https://unpkg.com">
  <link rel="stylesheet" href="/style.css?v=2">
`.trim();

for (const file of ejsFiles) {
    const filePath = path.join(viewsDir, file);
    let content = fs.readFileSync(filePath, 'utf-8');
    
    // Replace if it hasn't been replaced yet
    if (!content.includes('fonts.googleapis.com') && content.includes('<link rel="stylesheet" href="/style.css?v=2">')) {
        content = content.replace(/<link rel="stylesheet" href="\/style\.css\?v=2">/g, replacementBlock);
        fs.writeFileSync(filePath, content);
        console.log(`Updated ${file}`);
    }
}
