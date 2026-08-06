export const wikiDictionary = [
    // === 1. Легендарные двигатели и семейства (СНГ и Мир) ===
    { name: 'Двигатели Volkswagen (CWVA, CFNA, EA888, EA211)', regex: /(?<![\p{L}\p{N}_])(CWVA|CFNA|EA888|EA211)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Категория:Двигатели_Volkswagen' },
    { name: 'Двигатели Renault (K4M, F4R, H4M, HR16DE)', regex: /(?<![\p{L}\p{N}_])(K4M|F4R|H4M|HR16DE)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Категория:Двигатели_Renault' },
    { name: 'Двигатели Toyota (1JZ, 2JZ, 3S-FE, 1UZ...)', regex: /(?<![\p{L}\p{N}_])(1JZ|2JZ|3S-FE|1NZ-FE|2GR-FE|1UZ|3UZ|UZ-FE|UR-FE)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Категория:Двигатели_Toyota' },
    { name: 'Двигатели BMW (N63, M54, B58)', regex: /(?<![\p{L}\p{N}_])(N63|N63B44|M54|M54B30|B58)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Категория:Двигатели_BMW' },
    { name: 'Двигатели Mitsubishi (4G63, 6G72)', regex: /(?<![\p{L}\p{N}_])(4G63|6G72)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Категория:Двигатели_Mitsubishi' },
    { name: 'Ford EcoBoost', regex: /(?<![\p{L}\p{N}_])(EcoBoost|Экобуст)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Ford_EcoBoost' },
    { name: 'Оппозитные двигатели Subaru (EJ20, FB25)', regex: /(?<![\p{L}\p{N}_])(EJ20|EJ25|FB20|FB25|оппозитн[а-я]+ двигател[ьа-я]*)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Оппозитный_двигатель' },
    { name: 'Двигатели АвтоВАЗ (Шеснарь, 21126)', regex: /(?<![\p{L}\p{N}_])(Шеснарь|ВАЗ-21126|ВАЗ-21129|ВАЗ-21179)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Категория:Двигатели_АвтоВАЗа' },
    { name: 'Двигатели Hyundai / Kia (G4FC, G4KD, Theta II)', regex: /(?<![\p{L}\p{N}_])(G4FC|G4FG|G4KD|G4KE|G4NA|Theta II)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Категория:Двигатели_Hyundai' },
    { name: 'Двигатели General Motors (Ecotec, Z18XER)', regex: /(?<![\p{L}\p{N}_])(Ecotec|Z18XER|F14D4)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Категория:Двигатели_General_Motors' },
    { name: 'Двигатели Honda K-серии', regex: /(?<![\p{L}\p{N}_])(K20A|K24A)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Двигатель_Honda_K' },
    { name: 'Двигатели Nissan (RB26, VQ35DE)', regex: /(?<![\p{L}\p{N}_])(RB26|RB25DET|RB26DETT|VQ25DE|VQ35DE)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Категория:Двигатели_Nissan' },

    // === 2. Архитектура двигателей ===
    { name: 'V-образный двигатель', regex: /(?<![\p{L}\p{N}_])(V6|V8|V12|V-образн[а-я]+ двигател[ьа-я]*)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/V-образный_двигатель' },
    { name: 'VR-двигатель (смещенно-рядный)', regex: /(?<![\p{L}\p{N}_])(VR6|смещенно-рядн[а-я]+ двигател[ьа-я]*)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/VR-двигатель' },
    { name: 'Рядный шестицилиндровый двигатель (R6)', regex: /(?<![\p{L}\p{N}_])(рядн[а-я]+ шестерк[а-я]*|R6|L6)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Рядный_шестицилиндровый_двигатель' },
    { name: 'Рядный четырёхцилиндровый двигатель (R4)', regex: /(?<![\p{L}\p{N}_])(рядн[а-я]+ четверк[а-я]*|R4|L4)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Рядный_четырёхцилиндровый_двигатель' },
    { name: 'W-образный двигатель', regex: /(?<![\p{L}\p{N}_])(W12|W16|W-образн[а-я]+ двигател[ьа-я]*)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/W-образный_двигатель' },
    { name: 'Роторно-поршневой двигатель (Ванкеля)', regex: /(?<![\p{L}\p{N}_])(роторн[а-я]+ двигател[ьа-я]*|Ванкел[ья]|13B-REW)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Роторно-поршневой_двигатель' },

    // === 3. Воздушная система и Турбонаддув ===
    { name: 'Турбокомпрессор (Турбина)', regex: /(?<![\p{L}\p{N}_])(турбин[а-я]*|турбокомпрессор[а-я]*|турбонаддув[а-я]*|Twin-turbo|Bi-turbo)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Турбокомпрессор' },
    { name: 'Интеркулер (Промежуточный охладитель)', regex: /(?<![\p{L}\p{N}_])(интеркулер[а-я]*|промежуточн[а-я]+ охладител[ьа-я]*)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Интеркулер' },
    { name: 'Механический нагнетатель (Компрессор)', regex: /(?<![\p{L}\p{N}_])(механическ[а-я]+ нагнетател[ьа-я]*|компрессор[а-я]* наддува)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Нагнетатель' },

    // === 4. Топливные системы и впрыск ===
    { name: 'ТНВД — Топливный насос высокого давления', regex: /(?<![\p{L}\p{N}_])(ТНВД|топливн[а-я]+ насос[а-я]* высокого давления)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Топливный_насос_высокого_давления' },
    { name: 'Common Rail (TDI, CRDi, CDI, D-4D)', regex: /(?<![\p{L}\p{N}_])(TDI|CRDi|CDI|D-4D|Common Rail)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Аккумуляторная_топливная_система' },
    { name: 'Непосредственный впрыск (TSI, GDI, FSI)', regex: /(?<![\p{L}\p{N}_])(TSI|TFSI|FSI|GDI)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Система_непосредственного_впрыска_топлива' },
    { name: 'Инжекторная система подачи топлива (MPI)', regex: /(?<![\p{L}\p{N}_])(MPI|инжектор[а-я]*)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Инжекторная_система_подачи_топлива' },
    { name: 'Насос-форсунка (Pumpe Düse)', regex: /(?<![\p{L}\p{N}_])(Pumpe D[üu]se|насос-форсунк[а-я]*)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Насос-форсунка' },

    // === 5. Фирменные системы ГРМ и привода ===
    { name: 'VVT-i — Система изменения фаз (Toyota)', regex: /(?<![\p{L}\p{N}_])(VVT-i|Dual VVT-i|CVVT)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/VVT-i' },
    { name: 'VTEC — Система изменения фаз (Honda)', regex: /(?<![\p{L}\p{N}_])(VTEC|i-VTEC)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/VTEC' },
    { name: 'VANOS — Система изменения фаз (BMW)', regex: /(?<![\p{L}\p{N}_])(Vanos|Double Vanos|Ванос)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/VANOS' },
    { name: 'Полный привод (Quattro, 4MATIC, xDrive)', regex: /(?<![\p{L}\p{N}_])(Quattro|4Motion|xDrive|4MATIC|Symmetrical AWD|Super Select)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Полный_привод' },
    { name: 'Муфта Haldex', regex: /(?<![\p{L}\p{N}_])(Haldex|Халдекс)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Халдекс_(муфта)' },
    { name: 'Дифференциал Torsen', regex: /(?<![\p{L}\p{N}_])(Torsen|Торсен)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Torsen' },

    // === 6. Коробки передач (КПП) ===
    { name: 'АКПП — Автоматическая коробка передач', regex: /(?<![\p{L}\p{N}_])(АКПП|автоматическ[а-я]+ коробк[а-я]+ передач)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Автоматическая_коробка_передач' },
    { name: 'МКПП — Механическая коробка передач', regex: /(?<![\p{L}\p{N}_])(МКПП|механическ[а-я]+ коробк[а-я]+ передач)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Механическая_коробка_передач' },
    { name: 'РКПП — Роботизированная коробка передач', regex: /(?<![\p{L}\p{N}_])(РКПП|роботизированн[а-я]+ коробк[а-я]+|робот)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Роботизированная_коробка_передач' },
    { name: 'DSG — Трансмиссия с двумя сцеплениями', regex: /(?<![\p{L}\p{N}_])(DSG|DSG-7|DSG-6|DQ200|DQ250|S-Tronic|PowerShift)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Трансмиссия_с_двумя_сцеплениями' },
    { name: 'CVT — Бесступенчатая трансмиссия (Вариатор)', regex: /(?<![\p{L}\p{N}_])(CVT|вариатор[а-я]*|X-Tronic|Jatco|JF011E|JF015E|Lineartronic)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Бесступенчатая_трансмиссия' },
    { name: 'Aisin — Производитель трансмиссий', regex: /(?<![\p{L}\p{N}_])(Aisin|Айсин)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Aisin' },
    { name: 'ZF — Производитель трансмиссий', regex: /(?<![\p{L}\p{N}_])(ZF|ZF 8HP|ZF 6HP)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/ZF_Friedrichshafen_AG' },
    { name: 'Tiptronic — Ручное переключение передач', regex: /(?<![\p{L}\p{N}_])(Tiptronic|Типтроник|Steptronic)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Типтроник' },

    // === 7. Ходовая часть и Подвеска ===
    { name: 'Подвеска Макферсон', regex: /(?<![\p{L}\p{N}_])(Макферсон|MacPherson)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Подвеска_Макферсон' },
    { name: 'Многорычажная подвеска', regex: /(?<![\p{L}\p{N}_])(многорычажн[а-я]+ подвеск[а-я]*|многорычажк[а-я]*)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Многорычажная_подвеска' },
    { name: 'Пневматическая подвеска', regex: /(?<![\p{L}\p{N}_])(пневмоподвеск[а-я]*|пневматическ[а-я]+ подвеск[а-я]*)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Пневматическая_подвеска' },
    { name: 'Рулевой механизм (Рулевая рейка)', regex: /(?<![\p{L}\p{N}_])(рулевая рейк[а-я]*|рулевой механизм[а-я]*)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Рулевой_механизм' },
    { name: 'Сайлентблок', regex: /(?<![\p{L}\p{N}_])(сайлентблок[а-я]*|резинометаллический шарнир[а-я]*)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Сайлентблок' },
    { name: 'Амортизатор', regex: /(?<![\p{L}\p{N}_])(амортизатор[а-я]*)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Амортизатор' },

    // === 8. Электроника, датчики и безопасность ===
    { name: 'ЭБУ — Электронный блок управления', regex: /(?<![\p{L}\p{N}_])(ЭБУ|электронн[а-я]+ блок[а-я]+ управлени[яи])(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Электронный_блок_управления' },
    { name: 'CAN-шина — Сетевой интерфейс', regex: /(?<![\p{L}\p{N}_])(CAN-шин[а-я]*|шины CAN)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Controller_Area_Network' },
    { name: 'OBD-II — Компьютерная диагностика', regex: /(?<![\p{L}\p{N}_])(OBD-II|OBD2|On-Board Diagnostics)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Компьютерная_диагностика_автомобиля' },
    { name: 'Check Engine — Индикатор неисправности', regex: /(?<![\p{L}\p{N}_])(Check Engine|Чек Энжн|индикатор неисправности двигателя)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Лампа_аварийной_сигнализации' },
    { name: 'ABS — Антиблокировочная система', regex: /(?<![\p{L}\p{N}_])(ABS|АБС|антиблокировочн[а-я]+ систем[а-я]+)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Антиблокировочная_система' },
    { name: 'ESP — Система контроля устойчивости', regex: /(?<![\p{L}\p{N}_])(ESP|ESC|система стабилизации)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Электронная_система_контроля_устойчивости' },
    { name: 'SRS (Airbag) — Подушка безопасности', regex: /(?<![\p{L}\p{N}_])(SRS|Airbag|подушк[а-я]+ безопасности)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Подушка_безопасности' },
    { name: 'VIN-код — Идентификационный номер', regex: /(?<![\p{L}\p{N}_])(VIN|ВИН-код[а-я]*|идентификационный номер транспортного средства)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Идентификационный_номер_транспортного_средства' },

    // === 9. Популярные датчики (Кириллица) ===
    { name: 'ДМРВ — Датчик массового расхода воздуха', regex: /(?<![\p{L}\p{N}_])(ДМРВ|датчик[а-я]* массового расхода воздуха)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Датчик_массового_расхода_воздуха' },
    { name: 'ДПДЗ — Дроссельная заслонка', regex: /(?<![\p{L}\p{N}_])(ДПДЗ|дроссельн[а-я]+ заслонк[а-я]*)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Дроссельная_заслонка' },
    { name: 'ДПКВ — Датчик положения коленчатого вала', regex: /(?<![\p{L}\p{N}_])(ДПКВ|датчик[а-я]* положения коленчатого вала)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Датчик_положения_коленчатого_вала' },
    { name: 'ДПРВ — Датчик положения распредвала', regex: /(?<![\p{L}\p{N}_])(ДПРВ|датчик[а-я]* положения распределительного вала)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Датчик_положения_распределительного_вала' },
    { name: 'Лямбда-зонд — Кислородный датчик', regex: /(?<![\p{L}\p{N}_])(лямбда-зонд[а-я]*|кислородн[а-я]+ датчик[а-я]*)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Кислородный_датчик' },

    // === 10. Экология ===
    { name: 'EGR — Система рециркуляции выхлопных газов', regex: /(?<![\p{L}\p{N}_])(EGR|ЕГР|клапан[а-я]* рециркуляции)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Система_рециркуляции_выхлопных_газов' },
    { name: 'DPF — Сажевый фильтр', regex: /(?<![\p{L}\p{N}_])(DPF|сажев[а-я]* фильтр[а-я]*)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Сажевый_фильтр' },
    { name: 'Катализатор — Каталитический нейтрализатор', regex: /(?<![\p{L}\p{N}_])(каталитическ[а-я]+ нейтрализатор[а-я]*|катализатор[а-я]*)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Каталитический_нейтрализатор' },

    // === 11. Железо и Базовая Механика ===
    { name: 'ДВС — Двигатель внутреннего сгорания', regex: /(?<![\p{L}\p{N}_])(ДВС|двигател[ьяюем]+ внутренн[ео]го сгорания)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Двигатель_внутреннего_сгорания' },
    { name: 'ГБЦ — Головка блока цилиндров', regex: /(?<![\p{L}\p{N}_])(ГБЦ|головк[а-я]* блок[а-я]* цилиндров)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Головка_блока_цилиндров' },
    { name: 'ГРМ — Газораспределительный механизм', regex: /(?<![\p{L}\p{N}_])(ГРМ|газораспределительн[а-я]+ механизм[а-я]*)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Газораспределительный_механизм' },
    { name: 'ШРУС — Шарнир равных угловых скоростей', regex: /(?<![\p{L}\p{N}_])(ШРУС|шарнир[а-я]* равных угловых скоростей)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Шарнир_равных_угловых_скоростей' },
    { name: 'ЭУР / ГУР — Усилитель рулевого управления', regex: /(?<![\p{L}\p{N}_])(ЭУР|ГУР|гидроусилител[ьа-я]*|электроусилител[ьа-я]*)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Усилитель_рулевого_управления' },
    { name: 'Катушка зажигания', regex: /(?<![\p{L}\p{N}_])(катушк[а-я]* зажигания)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Катушка_зажигания' },
    { name: 'Свеча зажигания', regex: /(?<![\p{L}\p{N}_])(свеч[а-я]*\s+(?:зажигания|накаливания))(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Свеча_зажигания' },
    { name: 'Иммобилайзер', regex: /(?<![\p{L}\p{N}_])(иммобилайзер[а-я]*)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Иммобилайзер' },
    // === 7. Электроника и управление ===
    { name: 'ЭБУ — Электронный блок управления (ECU)', regex: /(?<![\p{L}\p{N}_])(ЭБУ|ECU|электронн[а-я]+ блок[а-я]* управления|PCM)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Электронный_блок_управления' },
    { name: 'ABS — Антиблокировочная система', regex: /(?<![\p{L}\p{N}_])(ABS|АБС|антиблокировочн[а-я]+ систем[а-я]*)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Антиблокировочная_система' },
    { name: 'ESP — Электронная система контроля устойчивости', regex: /(?<![\p{L}\p{N}_])(ESP|ESC|VSC|курсов[а-я]+ устойчивост[ьа-я]*)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Электронная_система_контроля_устойчивости_автомобиля' },
    { name: 'Лямбда-зонд — Кислородный датчик', regex: /(?<![\p{L}\p{N}_])(лямбда-зонд[а-я]*|кислородн[а-я]+ датчик[а-я]*|O2 sensor|датчик[а-я]* кислорода)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Лямбда-зонд' },
    { name: 'Катализатор — Каталитический нейтрализатор', regex: /(?<![\p{L}\p{N}_])(катализатор[а-я]*|каталитическ[а-я]+ нейтрализатор[а-я]*)(?![\p{L}\p{N}_])/ui, url: 'https://ru.wikipedia.org/wiki/Каталитический_конвертер' },
    
    // === 8. Прочие автомобильные термины ===
];