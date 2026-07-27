document.addEventListener('DOMContentLoaded', () => {
    // =========================================
    // 1. Управление Темой (Светлая / Темная)
    // =========================================
    const themeToggleBtn = document.getElementById('theme-toggle');

    // Инициализация темы из localStorage
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else if (!savedTheme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        // Поддержка системной темы по умолчанию
        document.documentElement.setAttribute('data-theme', 'dark');
    }

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            if (currentTheme === 'dark') {
                document.documentElement.removeAttribute('data-theme');
                localStorage.setItem('theme', 'light');
            } else {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
            }
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
                } catch(e) {}

                // Плавное скрытие оверлея
                if (paywallOverlay) {
                    paywallOverlay.style.opacity = '0';
                }

                setTimeout(() => {
                    // Перезагрузка для отрисовки серверного контента с аккордеонами
                    window.location.reload();
                }, 300);

            } catch (error) {
                console.error('Ошибка:', error);
                alert('Произошла ошибка при разблокировке: ' + error.message);
                unlockBtn.disabled = false;
                unlockBtn.innerText = 'Открыть отчет за 700 ₸';
            }
        });
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
            "Toyota": ["Camry", "Corolla", "RAV4", "Land Cruiser", "Yaris", "Highlander"],
            "Hyundai": ["Accent", "Elantra", "Sonata", "Tucson", "Santa Fe", "Creta"],
            "Kia": ["Rio", "Cerato", "Optima", "K5", "Sportage", "Sorento"],
            "Lada": ["Granta", "Vesta", "Niva", "Priora", "Largus", "Kalina"],
            "Volkswagen": ["Polo", "Jetta", "Passat", "Tiguan", "Touareg", "Golf"],
            "Skoda": ["Rapid", "Octavia", "Superb", "Kodiaq", "Karoq"],
            "Renault": ["Logan", "Duster", "Sandero", "Kaptur", "Arkana"],
            "Nissan": ["Almera", "Qashqai", "X-Trail", "Terrano", "Juke"],
            "Chevrolet": ["Nexia", "Cobalt", "Spark", "Tracker", "Cruze", "Tahoe"],
            "Ford": ["Focus", "Fiesta", "Mondeo", "Kuga", "Transit"],
            "BMW": ["3-Series", "5-Series", "X3", "X5", "X6"],
            "Mercedes-Benz": ["C-Class", "E-Class", "S-Class", "GLC", "GLE"],
            "Audi": ["A3", "A4", "A6", "Q5", "Q7"],
            "Mazda": ["3", "6", "CX-5", "CX-9"],
            "Geely": ["Coolray", "Atlas", "Monjaro", "Tugella"],
            "Chery": ["Tiggo 4", "Tiggo 7", "Tiggo 8", "Omoda C5"]
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
        resultContainer.innerHTML = `<p class="text-red-500 font-medium py-3 px-4 bg-red-50 rounded-xl border border-red-100">❌ Ошибка: ${data.error}</p>`;
        return;
      }

      // Успех! Парсим JSON с расходниками, который вернул ИИ
      const consumables = typeof data.car.consumablesJson === 'string' 
        ? JSON.parse(data.car.consumablesJson) 
        : data.car.consumablesJson;

      // Красиво отрисовываем результат
      resultContainer.innerHTML = `
        <div class="bg-blue-50/50 border border-blue-100 rounded-2xl p-5 mt-4">
          <h3 class="text-lg font-bold text-gray-900 mb-3">✅ Расходники для ${data.car.brand} ${data.car.model} (${data.car.year})</h3>
          <ul class="space-y-2.5 text-sm text-gray-700">
            <li class="flex items-center gap-2"><span>💧 <b>Моторное масло:</b> ${consumables.oil.type} (Допуск: ${consumables.oil.spec}, Объём: ${consumables.oil.volume_liters} л.)</span></li>
            <li class="flex items-center gap-2"><span>🧹 <b>Дворники (мм):</b> Водитель ${consumables.wipers.driver_mm} / Пассажир ${consumables.wipers.passenger_mm} ${consumables.wipers.rear_mm ? '/ Задний ' + consumables.wipers.rear_mm : ''}</span></li>
            <li class="flex items-center gap-2"><span>⛽ <b>Рекомендуемое топливо:</b> ${consumables.fuel.type}</span></li>
            <li class="flex items-center gap-2"><span>❄️ <b>Антифриз:</b> ${consumables.coolant.type} (${consumables.coolant.color}, ${consumables.coolant.volume_liters} л.)</span></li>
          </ul>
          <div class="mt-4 pt-3 border-t border-blue-100 flex justify-end">
            <button type="button" onclick="location.reload()" class="text-xs bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">Сохранить и обновить гараж</button>
          </div>
        </div>
      `;
    } catch (error) {
      resultContainer.innerHTML = '<p class="text-red-500 font-medium py-3 px-4 bg-red-50 rounded-xl border border-red-100">❌ Ошибка связи с сервером.</p>';
    }
  });
}

window.selectPlan = function(plan) {
  const titles = {
    single: "1 Автомобиль (Базовый)",
    multi: "До 5 Автомобилей (Семья)",
    pro: "Безлимит (Сервис / СТО)"
  };
  alert(`Выбран тариф: "${titles[plan] || plan}". Переход к шлюзу оплаты подписки...`);
};

window.deleteCarFromGarage = async function(carId) {
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

