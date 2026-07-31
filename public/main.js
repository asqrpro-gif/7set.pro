document.addEventListener('DOMContentLoaded', () => {
  // =========================================
  // 1. Управление Темой (Светлая / Темная)
  // =========================================
  const themeToggleBtn = document.getElementById('theme-toggle');

  const updateThemeIcon = () => {
    if (!themeToggleBtn) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    themeToggleBtn.innerHTML = `<i data-lucide="${isDark ? 'sun' : 'moon'}" class="w-5 h-5 text-gray-700"></i>`;
    if (window.lucide && typeof lucide.createIcons === 'function') {
      lucide.createIcons();
    }
  };

  // Инициализация темы из localStorage
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('dark');
  } else if (!savedTheme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    // Поддержка системной темы по умолчанию
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('dark');
  }
  updateThemeIcon();

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      if (currentTheme === 'dark') {
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      }
      updateThemeIcon();
    });
  }

  // =========================================
  // 2. Логика Разблокировки Пейволла
  // =========================================
  const unlockBtn = document.getElementById('unlock-btn');
  const paywallContainer = document.getElementById('paywall-container');
  const paywallOverlay = document.getElementById('paywall-overlay');

  if (unlockBtn && paywallContainer) {
    unlockBtn.addEventListener('click', async () => {
      const reportId = paywallContainer.getAttribute('data-report-id');
      if (!reportId) return;

      // Эмуляция процесса оплаты (интеграция с Kaspi / эквайрингом)
      unlockBtn.disabled = true;
      unlockBtn.innerText = 'Обработка платежа...';

      try {
        await new Promise(resolve => setTimeout(resolve, 800));

        const response = await fetch('/api/unlock-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reportId,
            paymentToken: 'fake_kaspi_token_123'
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Ошибка разблокировки отчета');
        }

        // Дублируем сохранение в localStorage и cookie на стороне клиента (на 3 дня) для гарантированного доступа после перезагрузки
        try {
          let localList = JSON.parse(localStorage.getItem('unlocked_reports') || '[]');
          if (!Array.isArray(localList)) localList = [];
          if (!localList.includes(reportId)) localList.push(reportId);
          localStorage.setItem('unlocked_reports', JSON.stringify(localList));
          document.cookie = `unlocked_reports=${encodeURIComponent(JSON.stringify(localList))}; max-age=${3 * 24 * 60 * 60}; path=/`;
        } catch (e) { }

        // Плавное скрытие оверлея
        if (paywallOverlay) {
          paywallOverlay.style.opacity = '0';
        }

        setTimeout(() => {
          // Перезагрузка для отрисовки серверного контента с аккордеонами
          sessionStorage.setItem('scrollToPaywall', 'true');
          window.location.reload();
        }, 300);

      } catch (error) {
        console.error('Ошибка:', error);
        alert('Произошла ошибка при разблокировке: ' + error.message);
        unlockBtn.disabled = false;
        unlockBtn.innerText = 'Разблокировать за $1.99';
      }
    });
  }

  // Проверяем, нужно ли прокрутить к разблокированному контенту
  if (sessionStorage.getItem('scrollToPaywall') === 'true') {
    sessionStorage.removeItem('scrollToPaywall');
    setTimeout(() => {
      if (paywallContainer) {
        paywallContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }

  // =========================================
  // 3. Умный ввод (Автокомплит Марки и Модели)
  // =========================================
  const inputBrand = document.getElementById('inputBrand');
  const brandOptions = document.getElementById('brand-options');
  const inputModel = document.getElementById('inputModel');
  const modelOptions = document.getElementById('model-options');

  if (inputBrand && brandOptions && inputModel && modelOptions) {
    const carData = {
        "Toyota": ["Camry", "Corolla", "RAV4", "Land Cruiser", "Yaris", "Highlander", "Land Cruiser Prado", "Prius", "Avensis", "Hilux", "Mark II"],
        "Hyundai": ["Accent", "Elantra", "Sonata", "Tucson", "Santa Fe", "Creta", "Solaris", "Getz", "Palisade", "H-1", "Staria"],
        "Kia": ["Rio", "Cerato", "Optima", "K5", "Sportage", "Sorento", "Ceed", "Soul", "Mohave", "Spectra"],
        "Lada": ["Granta", "Vesta", "Niva", "Priora", "Largus", "Kalina", "2114", "2107", "2110", "XRAY"],
        "Volkswagen": ["Polo", "Jetta", "Passat", "Tiguan", "Touareg", "Golf", "Transporter", "Caravelle", "Caddy", "Multivan"],
        "Skoda": ["Rapid", "Octavia", "Superb", "Kodiaq", "Karoq", "Fabia", "Yeti"],
        "Renault": ["Logan", "Duster", "Sandero", "Kaptur", "Arkana", "Megane", "Fluence", "Stepway", "Kangoo"],
        "Nissan": ["Almera", "Qashqai", "X-Trail", "Terrano", "Juke", "Teana", "Tiida", "Note", "Patrol", "Primera"],
        "Chevrolet": ["Nexia", "Cobalt", "Spark", "Tracker", "Cruze", "Tahoe", "Aveo", "Lacetti", "Captiva", "Lanos", "Niva"],
        "Ford": ["Focus", "Fiesta", "Mondeo", "Kuga", "Transit"],
        "BMW": ["3-Series", "5-Series", "X3", "X5", "X6"],
        "Mercedes-Benz": ["C-Class", "E-Class", "S-Class", "GLC", "GLE", "G-Class", "Sprinter", "Vito", "Viano"],
        "Audi": ["A3", "A4", "A6", "Q5", "Q7", "80", "100", "A8", "Q3"],
        "Mazda": ["3", "6", "CX-5", "CX-9"],
        "Geely": ["Coolray", "Atlas", "Monjaro", "Tugella", "Emgrand"],
        "Chery": ["Tiggo 4", "Tiggo 7", "Tiggo 8", "Omoda C5"],
    
        // Новые марки, добавленные для охвата СНГ
        "Mitsubishi": ["Outlander", "Lancer", "Pajero", "Pajero Sport", "ASX", "L200"],
        "Honda": ["Civic", "Accord", "CR-V", "Fit", "HR-V", "Odyssey"],
        "Lexus": ["RX", "LX", "NX", "ES", "GS", "IS"],
        "Haval": ["Jolion", "F7", "F7x", "Dargo", "H9"],
        "Subaru": ["Forester", "Outback", "Impreza", "Legacy", "XV"],
        "Suzuki": ["Grand Vitara", "Vitara", "SX4", "Jimny", "Swift"],
        "Opel": ["Astra", "Vectra", "Corsa", "Zafira", "Mokka", "Antara"],
        "Daewoo": ["Matiz", "Nexia", "Lanos"],
        "Peugeot": ["308", "408", "3008", "Partner", "Boxer"],
        "UAZ": ["Patriot", "Hunter", "Bukhanka"],
        "GAZ": ["Gazelle", "Sobol", "Volga"],
        "Changan": ["CS35 Plus", "CS55 Plus", "UNI-K", "UNI-V", "CS75 Plus"],
        "Exeed": ["LX", "TXL", "VX", "RX"],
        "Tank": ["300", "500"]
      };

      // Заполняем список марок
      Object.keys(carData).forEach(brand => {
        const option = document.createElement('option');
        option.value = brand;
        brandOptions.appendChild(option);
      });

      // Слушатель изменения марки
      inputBrand.addEventListener('input', (e) => {
        const selectedBrand = e.target.value.trim();

        // Очищаем список моделей
        modelOptions.innerHTML = '';

        // Ищем марку (регистронезависимо)
        const matchedKey = Object.keys(carData).find(k => k.toLowerCase() === selectedBrand.toLowerCase());

        if (matchedKey) {
          carData[matchedKey].forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            modelOptions.appendChild(option);
          });
        }

        // Включаем поле модели, если марка выбрана корректно
        if (matchedKey) {
          inputModel.disabled = false;
        } else {
          inputModel.disabled = true;
          inputModel.value = '';
        }
      });
    }

    // =========================================
    // 4. Валидация OBD2 кода и защита от дублей
    // =========================================
    const searchButton = document.getElementById('btnSearch');
    const codeInput = document.getElementById('inputCode');
    const errorHint = document.getElementById('codeErrorHint');

    if (searchButton && codeInput && errorHint) {
      searchButton.addEventListener('click', (e) => {
        // Очищаем предыдущую ошибку
        errorHint.style.display = 'none';
        errorHint.innerText = '';

        let codeValue = codeInput.value.trim().toUpperCase();

        // Фикс для пользователей: если ввели ровно 4 цифры (например, "0171"), автодобавляем префикс "P"
        if (/^[0-9]{4}$/.test(codeValue)) {
          codeValue = 'P' + codeValue;
        }

        codeInput.value = codeValue; // Возвращаем отформатированное значение в поле

        if (!codeValue) return; // Пустое поле обработает стандартный HTML5 required

        // Проверка формата OBD2 (Буква P, B, C, U и 4 символа шестнадцатеричного кода)
        const obdRegex = /^[PBUC][0-9A-F]{4}$/;
        if (!obdRegex.test(codeValue)) {
          e.preventDefault(); // Останавливаем отправку формы
          errorHint.innerText = "Неверный формат. Код должен состоять из префикса (P, B, C, U) и 4 символов, например: P0171.";
          errorHint.style.display = 'block';
          return;
        }

        // Предотвращаем стандартный клик и выполняем программную отправку формы
        e.preventDefault();

        // Защита от двойного клика / повторной отправки
        searchButton.disabled = true;
        searchButton.innerText = 'Сканируем базу...';

        // Безопасно находим родительскую форму независимо от наличия у неё id
        const form = searchButton.closest('form') || searchButton.form;
        if (form) {
          form.submit();
        }
      });
    }

    // Гарантированная отрисовка иконок Lucide для всего Markdown контента ИИ
    if (window.lucide && typeof lucide.createIcons === 'function') {
      lucide.createIcons();
    }
  });

// ==========================================
// Логика добавления авто в Гараж и выбора тарифа
// ==========================================
const addCarForm = document.getElementById('add-car-form');
const resultContainer = document.getElementById('consumables-result');

if (addCarForm) {
  addCarForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Показываем загрузку (ИИ думает)
    resultContainer.style.display = 'block';
    resultContainer.innerHTML = '<p class="text-blue-600 font-medium py-4 text-center animate-pulse">⏳ ИИ подбирает допуски и размеры под вашу модификацию...</p>';

    // Собираем данные из формы
    const carData = {
      brand: document.getElementById('car-brand').value,
      model: document.getElementById('car-model').value,
      engine: document.getElementById('car-engine').value,
      year: document.getElementById('car-year').value
    };

    try {
      // Отправляем запрос на наш бэкенд
      const response = await fetch('/garage/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(carData)
      });

      const data = await response.json();

      if (!response.ok) {
        // Ошибка (например, превышен лимит тарифа)
        resultContainer.innerHTML = `<p class="text-red-500 font-medium py-3 px-4 bg-red-50 rounded-xl border border-red-100 flex items-center gap-2"><i data-lucide="alert-circle" class="w-5 h-5 shrink-0 text-red-500"></i><span>Ошибка: ${data.error}</span></p>`;
        if (window.lucide) lucide.createIcons();
        return;
      }

      // Успех! Парсим JSON с расходниками, который вернул ИИ
      const consumables = typeof data.car.consumablesJson === 'string'
        ? JSON.parse(data.car.consumablesJson)
        : data.car.consumablesJson;

      // Красиво отрисовываем результат
      resultContainer.innerHTML = `
        <div class="bg-blue-50/50 border border-blue-100 rounded-2xl p-5 mt-4">
          <h3 class="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2"><i data-lucide="check-circle-2" class="w-5 h-5 text-emerald-500 shrink-0"></i><span>Расходники для ${data.car.brand} ${data.car.model} (${data.car.year})</span></h3>
          <ul class="space-y-2.5 text-sm text-gray-700">
            <li class="flex items-center gap-2.5"><i data-lucide="droplet" class="w-4 h-4 text-blue-500 shrink-0 fill-blue-500/10"></i><span><b>Моторное масло:</b> ${consumables.oil.type} (Допуск: ${consumables.oil.spec}, Объём: ${consumables.oil.volume_liters} л.)</span></li>
            <li class="flex items-center gap-2.5"><i data-lucide="wind" class="w-4 h-4 text-cyan-500 shrink-0"></i><span><b>Дворники (мм):</b> Водитель ${consumables.wipers.driver_mm} / Пассажир ${consumables.wipers.passenger_mm} ${consumables.wipers.rear_mm ? '/ Задний ' + consumables.wipers.rear_mm : ''}</span></li>
            <li class="flex items-center gap-2.5"><i data-lucide="fuel" class="w-4 h-4 text-amber-500 shrink-0 fill-amber-500/10"></i><span><b>Рекомендуемое топливо:</b> ${consumables.fuel.type}</span></li>
            <li class="flex items-center gap-2.5"><i data-lucide="snowflake" class="w-4 h-4 text-sky-500 shrink-0"></i><span><b>Антифриз:</b> ${consumables.coolant.type} (${consumables.coolant.color}, ${consumables.coolant.volume_liters} л.)</span></li>
          </ul>
          <div class="mt-4 pt-3 border-t border-blue-100 flex justify-end">
            <button type="button" onclick="location.reload()" class="text-xs bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">Сохранить и обновить гараж</button>
          </div>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
    } catch (error) {
      resultContainer.innerHTML = '<p class="text-red-500 font-medium py-3 px-4 bg-red-50 rounded-xl border border-red-100 flex items-center gap-2"><i data-lucide="alert-circle" class="w-5 h-5 shrink-0 text-red-500"></i><span>Ошибка связи с сервером.</span></p>';
      if (window.lucide) lucide.createIcons();
    }
  });
}

window.selectPlan = function (plan) {
  const titles = {
    single: "1 Автомобиль (Базовый)",
    multi: "До 5 Автомобилей (Семья)",
    pro: "Безлимит (Сервис / СТО)"
  };
  alert(`Выбран тариф: "${titles[plan] || plan}". Переход к шлюзу оплаты подписки...`);
};

window.deleteCarFromGarage = async function (carId) {
  if (!confirm("Удалить этот автомобиль из вашего Гаража?")) return;
  try {
    const res = await fetch(`/garage/${carId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      location.reload();
    } else {
      alert("Ошибка: " + (data.error || "Не удалось удалить авто"));
    }
  } catch (err) {
    alert("Ошибка связи с сервером");
  }
};

