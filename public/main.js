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
    const blurredContent = document.getElementById('blurred-content');
    const paywallOverlay = document.getElementById('paywall-overlay');

    if (unlockBtn && paywallContainer) {
        unlockBtn.addEventListener('click', async () => {
            const reportId = paywallContainer.getAttribute('data-report-id');
            if (!reportId) return;

            // Эмуляция процесса оплаты
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

                // Плавное скрытие оверлея
                paywallOverlay.style.opacity = '0';

                setTimeout(() => {
                    // Сервер рендерит полные данные (с аккордеонами и Markdown),
                    // поэтому проще и надежнее перезагрузить страницу
                    window.location.reload();
                }, 300);

            } catch (error) {
                console.error('Ошибка:', error);
                alert('Произошла ошибка при разблокировке: ' + error.message);
                unlockBtn.disabled = false;
                unlockBtn.innerText = 'Открыть за 700 ₸';
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

            // Включаем поле модели, если марка не пустая
            if (selectedBrand.length > 0) {
                inputModel.disabled = false;
            } else {
                inputModel.disabled = true;
                inputModel.value = '';
            }
        });
    }

    // =========================================
    // 4. Валидация OBD2 кода перед отправкой
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
            codeInput.value = codeValue; // Возвращаем в поле в верхнем регистре
            
            if (!codeValue) return; // Браузер сам обработает required

            // Проверка 1: Если ввели только 4 символа
            if (codeValue.length === 4) {
                e.preventDefault(); // Останавливаем отправку
                errorHint.innerText = "⚠️ Код должен начинаться с буквы (P, U, B, C). Посмотрите на сканер, какая буква стоит перед цифрами?";
                errorHint.style.display = 'block';
                return;
            }

            // Проверка 2: Если формат вообще не похож на OBD2
            const obdRegex = /^[PBUC][0-9A-F]{4}$/;
            if (!obdRegex.test(codeValue)) {
                e.preventDefault(); // Останавливаем отправку
                errorHint.innerText = "⚠️ Неверный формат. Код должен состоять из 1 буквы (P, B, C, U) и 4 цифр/букв (например: P0171).";
                errorHint.style.display = 'block';
                return;
            }
            
            // Если всё отлично, продолжаем стандартную отправку на сервер...
        });
    }
});
