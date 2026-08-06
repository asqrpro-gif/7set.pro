const text = `<div class="bg-blue-50/50 dark:bg-slate-700/30 border-l-4 border-blue-400 p-4 mt-6 rounded-r-xl text-sm">
<h4 class="flex items-center gap-2 text-base font-bold text-gray-800 dark:text-gray-100 mb-2 mt-0"><i data-lucide="book-open" class="w-4 h-4 text-blue-500"></i> Глоссарий терминов</h4>
<div class="text-gray-600 dark:text-gray-300 space-y-1">
<div>term1</div>
</div>
</div>`;

const oldGlossaryRegex = /<div class="bg-blue-50[^>]*>[\s\S]*?Глоссарий терминов[\s\S]*?(?=(###|$))/gi;
console.log('Original length:', text.length);
const replaced = text.replace(oldGlossaryRegex, '');
console.log('Result length:', replaced.length);
console.log('Result:', replaced);
