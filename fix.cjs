const fs = require('fs');
let content = fs.readFileSync('views/admin_seo_detector.ejs', 'utf-8');

// For tab-quality table:
content = content.replace(/<div class="p-3 border-b border-slate-700 bg-slate-800\/50">/g, '<div class="flex-1 overflow-auto bg-[#0f172a]/50 p-4">\n        <div class="mb-4">');

content = content.replace(/<\/div>\s*<div class="overflow-y-auto flex-1 p-0">/g, '</div>\n        <div class="overflow-x-auto min-h-0">');

content = content.replace(/<table class="w-full text-left border-collapse min-w-\[600px\] lg:min-w-full">/g, '<table class="w-full text-left border-collapse min-w-[900px]">');

content = content.replace(/<div class="p-4 border-t border-slate-700 bg-slate-800\/50 flex flex-col md:flex-row justify-between items-center gap-4">/g, '<div class="mt-4 flex flex-col md:flex-row justify-between items-center gap-4">');

// For tab-titles and tab-descriptions:
content = content.replace(/<table class="w-full text-left border-collapse min-w-\[700px\]">/g, '<table class="w-full text-left border-collapse min-w-[900px]">');

fs.writeFileSync('views/admin_seo_detector.ejs', content);
console.log('Fixed tabs structure!');
