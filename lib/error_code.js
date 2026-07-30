export function renderErrorCodePage(brand, code) {
  const formatTitleCase = (str) => str.split(/[\s-]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const displayBrand = formatTitleCase(brand);
  const displayCode = code.toUpperCase().trim();

  return `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Ошибка ${displayCode} не найдена | 7Set.Pro</title>
      <meta name="robots" content="noindex, follow">
      <script src="https://cdn.tailwindcss.com?plugins=typography"></script>
      <script>
        tailwind.config = { darkMode: 'class', theme: { extend: { colors: { brand: '#0077FF', surface: '#F5F5F7' } } } }
      </script>
      <link rel="stylesheet" href="/style.css">
      <script src="/main.js" defer></script>
      <script src="https://unpkg.com/lucide@latest"></script>
    </head>
    <body class="bg-surface dark:bg-slate-900 text-gray-900 dark:text-white font-sans antialiased min-h-screen flex flex-col justify-between">
      <div class="max-w-5xl mx-auto p-4 md:p-6 w-full flex-grow flex flex-col">
        <!-- Единая шапка (Header) -->
        <header class="flex justify-between items-center mb-6 bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
          <a href="/" class="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <i data-lucide="activity" style="color: #007bff;"></i>
            <span class="font-bold text-xl tracking-tight text-gray-900 dark:text-white">7Set.Pro</span> <span class="font-normal text-sm text-gray-500 dark:text-gray-400 ml-1 hidden md:inline">| Умная автодиагностика</span>
          </a>
          <div class="flex items-center gap-3">
            <a href="/garage" class="text-sm font-semibold bg-brand/10 dark:bg-brand/20 text-brand dark:text-blue-400 px-3.5 py-2 rounded-xl hover:bg-brand hover:text-white dark:hover:bg-brand dark:hover:text-white transition-all flex items-center gap-1.5 shadow-sm">
              <i data-lucide="car" class="w-4 h-4"></i> Гараж & ТО
            </a>
            <button id="theme-toggle" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors" aria-label="Переключить тему">
              <i data-lucide="moon" class="w-5 h-5 text-gray-700 dark:text-gray-300"></i>
            </button>
          </div>
        </header>

        <!-- Главное содержимое -->
        <main class="flex-grow flex items-center justify-center w-full">
          <div class="bg-white dark:bg-slate-800 rounded-[2rem] p-5 md:p-10 shadow-xl border border-gray-100 dark:border-slate-700 w-full max-w-2xl text-center relative overflow-hidden">
            <!-- Декоративный фон -->
            <div class="absolute top-0 left-1/2 -translate-x-1/2 w-full h-24 bg-gradient-to-b from-red-50 to-transparent dark:from-red-900/20 dark:to-transparent"></div>
            
            <div class="relative z-10 flex flex-col items-center">
              <div class="bg-white dark:bg-slate-800 p-2 rounded-3xl shadow-lg border border-red-100 dark:border-red-900/50 mb-4 inline-flex items-center justify-center">
                <div class="bg-red-100 dark:bg-red-500/20 text-red-500 p-3 rounded-2xl">
                  <i data-lucide="search-x" class="w-8 h-8 md:w-10 md:h-10"></i>
                </div>
              </div>
              
              <h1 class="text-xl md:text-3xl font-black mb-2 text-gray-900 dark:text-white tracking-tight">Ошибка <span class="text-brand">${displayCode}</span> не найдена</h1>
              
              <p class="text-sm md:text-base text-gray-500 dark:text-gray-400 mb-6 leading-relaxed max-w-lg mx-auto">
                Данный код не зарегистрирован в официальных базах данных OBD-II для марки <b class="text-gray-900 dark:text-white font-semibold">${displayBrand}</b>.
              </p>

              <div class="bg-gray-50 dark:bg-slate-700/50 rounded-2xl p-4 md:p-6 w-full text-left mb-6 border border-gray-100 dark:border-slate-700">
                <h3 class="font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4 text-sm md:text-base">
                  <i data-lucide="info" class="w-5 h-5 text-brand"></i>
                  Почему это могло произойти?
                </h3>
                <ul class="space-y-3 md:space-y-4 text-sm md:text-base text-gray-600 dark:text-gray-300">
                  <li class="flex items-start gap-3">
                    <div class="bg-white dark:bg-slate-800 p-1.5 rounded-lg border border-gray-200 dark:border-slate-600 mt-0.5 shrink-0 shadow-sm">
                      <i data-lucide="keyboard" class="w-4 h-4 text-gray-500 dark:text-gray-400"></i>
                    </div>
                    <div>
                      <strong class="text-gray-900 dark:text-gray-200 block">Опечатка при вводе</strong>
                      Проверьте код (обычно это латинская буква P, B, U или C и 4 цифры).
                    </div>
                  </li>
                  <li class="flex items-start gap-3">
                    <div class="bg-white dark:bg-slate-800 p-1.5 rounded-lg border border-gray-200 dark:border-slate-600 mt-0.5 shrink-0 shadow-sm">
                      <i data-lucide="cpu" class="w-4 h-4 text-gray-500 dark:text-gray-400"></i>
                    </div>
                    <div>
                      <strong class="text-gray-900 dark:text-gray-200 block">Ошибка сканера</strong>
                      Бюджетные адаптеры вроде ELM327 иногда выдают "фантомные" коды.
                    </div>
                  </li>
                  <li class="flex items-start gap-3">
                    <div class="bg-white dark:bg-slate-800 p-1.5 rounded-lg border border-gray-200 dark:border-slate-600 mt-0.5 shrink-0 shadow-sm">
                      <i data-lucide="car" class="w-4 h-4 text-gray-500 dark:text-gray-400"></i>
                    </div>
                    <div>
                      <strong class="text-gray-900 dark:text-gray-200 block">Редкая модификация</strong>
                      Код может быть специфичным для праворульного авто (JDM) или редкого мотора.
                    </div>
                  </li>
                </ul>
              </div>

              <div class="flex flex-col sm:flex-row gap-2 md:gap-4 w-full">
                <a href="/" class="flex-1 bg-brand hover:bg-blue-600 text-white font-bold py-3 md:py-4 text-sm md:text-base rounded-xl transition-all shadow-[0_0_15px_rgba(0,119,255,0.3)] hover:shadow-[0_0_20px_rgba(0,119,255,0.5)] hover:-translate-y-0.5 flex items-center justify-center gap-2">
                  <i data-lucide="search" class="w-5 h-5"></i>
                  Искать другой код
                </a>
                <a href="/garage" class="flex-1 bg-white dark:bg-slate-700 text-gray-800 dark:text-white border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-600 font-semibold py-3 md:py-4 text-sm md:text-base rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm hover:-translate-y-0.5">
                  <i data-lucide="wrench" class="w-5 h-5"></i>
                  Гараж и регламент ТО
                </a>
              </div>
            </div>
          </div>
        </main>
        
        <footer class="mt-6 pt-4 pb-4 text-center text-xs text-gray-500 dark:text-gray-400 opacity-60">
          © ${new Date().getFullYear()} 7Set.pro. Все права защищены.
        </footer>
      </div>
      
      <script>lucide.createIcons();</script>
    </body>
    </html>
  `;
}
