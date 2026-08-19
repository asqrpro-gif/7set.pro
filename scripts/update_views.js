import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const viewsDir = path.join(__dirname, '..', 'views');

function walkDir(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walkDir(file));
        } else if (file.endsWith('.ejs')) {
            results.push(file);
        }
    });
    return results;
}

const files = walkDir(viewsDir);

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    // 1. Remove tailwind CDN
    content = content.replace(/<script\s+src="https:\/\/cdn\.tailwindcss\.com[^>]*><\/script>/g, '');
    
    // 2. Remove tailwind.config blocks
    content = content.replace(/<script>\s*tailwind\.config\s*=\s*\{[\s\S]*?\}\s*<\/script>/g, '');
    
    // 3. Update lucide script to use defer
    content = content.replace(/<script\s+src="https:\/\/unpkg\.com\/lucide@latest"><\/script>/g, '<script src="https://unpkg.com/lucide@1.32.0/dist/umd/lucide.min.js" defer></script>');
    
    // 3.5 Wrap inline lucide calls in DOMContentLoaded
    content = content.replace(/<script>lucide\.createIcons\(\);<\/script>/g, "<script>document.addEventListener('DOMContentLoaded', () => { if(typeof lucide !== 'undefined') lucide.createIcons(); });</script>");
    
    // 4. Add tailwind.css if it doesn't have it, right before style.css or main.js or lucide
    if (original !== content && !content.includes('/tailwind.css')) {
        const replacement = `<link rel="preload" href="/tailwind.css" as="style">\n  <link rel="stylesheet" href="/tailwind.css">`;
        
        if (content.includes('<link rel="stylesheet" href="/style.css')) {
            content = content.replace('<link rel="stylesheet" href="/style.css', replacement + '\n  <link rel="stylesheet" href="/style.css');
        } else if (content.includes('<script src="https://unpkg.com/lucide@1.32.0')) {
            content = content.replace('<script src="https://unpkg.com/lucide@1.32.0', replacement + '\n  <script src="https://unpkg.com/lucide@1.32.0');
        } else if (content.includes('</head>')) {
            content = content.replace('</head>', replacement + '\n</head>');
        }
    }

    if (original !== content) {
        fs.writeFileSync(file, content);
        console.log('Updated:', path.relative(process.cwd(), file));
    }
});

console.log('Done updating views.');
