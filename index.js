import { Telegraf, Markup } from 'telegraf';
import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Временное хранилище сессий пользователей и активных опросов
const userSessions = new Map();
const activePolls = new Map();

// Максимум вопросов (фото) в одном тесте
const MAX_QUESTIONS_PER_TEST = 25;

// Словарь переводов
const i18n = {
    ru: {
        start: 'Привет! Отправь мне фото теста с правильным ответом. Можно отправить сразу несколько.',
        collected: '📥 Получено фото: {count} из {max}. Отправь еще или нажми кнопку ниже, чтобы начать.',
        generateBtn: '✅ Готово, начать анализ',
        analyzing_progress: '⏳ Идет подготовка тестов: анализирую фото {current} из {total}...',
        all_failed: '❌ Не удалось распознать ни одно фото. Попробуйте загрузить более четкие скриншоты.',
        finished: '🏁 Тестирование завершено!\n\n📊 Правильных ответов: {score} из {total}\n🎯 Точность: {percent}%',
        empty: 'Корзина пуста. Сначала отправь фото.',
        playing_error: '⚠️ Вы уже проходите или генерируете тест! Сначала завершите текущий процесс.',
        quota_exceeded: '⚠️ Лимит запросов к нейросети исчерпан. Попробуйте позже (через несколько минут, а если лимит дневной — завтра).',
        quota_partial: '⚠️ Лимит запросов к нейросети исчерпан. Удалось подготовить тестов: {done} из {total} фото. Начинаем с ними.',
        saved_title: '📚 Ваши сохранённые тесты (дата — вопросов). Выберите, чтобы пройти снова:',
        saved_empty: 'У вас пока нет сохранённых тестов. Отправьте фото, и тест сохранится автоматически.',
        saved_hint: '💾 Тест сохранён. Пройти его снова можно командой /mytests',
        queue_wait: '⏳ Вы в очереди: перед вами запросов — {n}. Анализ начнется автоматически.',
        limit_reached: '⚠️ Максимум {max} вопросов в одном тесте. Лишние фото пропущены — нажмите кнопку, чтобы начать анализ. Остальные отправите отдельным тестом.'
    },
    uz: {
        start: "Salom! Menga test rasmlarini yuboring. Bir nechta rasmni birdaniga yuborishingiz mumkin.",
        collected: "📥 Qabul qilingan rasmlar: {count} / {max}. Yana yuboring yoki boshlash uchun tugmani bosing.",
        generateBtn: "✅ Tayyor, tahlilni boshlash",
        analyzing_progress: "⏳ Testlar tayyorlanmoqda: {total} tadan {current}-rasm tahlil qilinmoqda...",
        all_failed: "❌ Hech qaysi rasmni o'qib bo'lmadi. Iltimos, aniqroq rasmlar yuboring.",
        finished: "🏁 Test yakunlandi!\n\n📊 To'g'ri javoblar: {total} tadan {score} ta\n🎯 Aniqlik: {percent}%",
        empty: "Savatcha bo'sh. Avval rasm yuboring.",
        playing_error: "⚠️ Siz allaqachon test yechyapsiz yoki jarayon ketyapti! Avval uni tugating.",
        quota_exceeded: "⚠️ Neyrotarmoqqa so'rovlar limiti tugadi. Keyinroq urinib ko'ring (bir necha daqiqadan keyin, kunlik limit bo'lsa — ertaga).",
        quota_partial: "⚠️ Neyrotarmoqqa so'rovlar limiti tugadi. {total} ta rasmdan {done} ta test tayyorlandi. Shular bilan boshlaymiz.",
        saved_title: "📚 Saqlangan testlaringiz (sana — savollar soni). Qayta yechish uchun tanlang:",
        saved_empty: "Hozircha saqlangan testlar yo'q. Rasm yuboring — test avtomatik saqlanadi.",
        saved_hint: "💾 Test saqlandi. Uni qayta yechish uchun /mytests buyrug'idan foydalaning.",
        queue_wait: "⏳ Siz navbatdasiz: oldingizda {n} ta so'rov bor. Tahlil avtomatik boshlanadi.",
        limit_reached: "⚠️ Bitta testda eng ko'pi bilan {max} ta savol bo'lishi mumkin. Ortiqcha rasmlar o'tkazib yuborildi — tahlilni boshlash uchun tugmani bosing. Qolganlarini alohida test sifatida yuborasiz."
    },
    en: {
        start: 'Hi! Send me a photo of a test with the correct answer highlighted. You can send several at once.',
        collected: '📥 Photos received: {count} of {max}. Send more or press the button below to start.',
        generateBtn: '✅ Done, start analysis',
        analyzing_progress: '⏳ Preparing tests: analyzing photo {current} of {total}...',
        all_failed: '❌ Could not recognize any photo. Please try uploading clearer screenshots.',
        finished: '🏁 Quiz finished!\n\n📊 Correct answers: {score} out of {total}\n🎯 Accuracy: {percent}%',
        empty: 'No photos yet. Send a photo first.',
        playing_error: '⚠️ You are already taking or generating a quiz! Please finish the current process first.',
        quota_exceeded: '⚠️ The AI request limit has been reached. Please try again later (in a few minutes, or tomorrow if it is a daily limit).',
        quota_partial: '⚠️ The AI request limit has been reached. Prepared {done} quizzes out of {total} photos. Starting with them.',
        saved_title: '📚 Your saved tests (date — questions). Pick one to retake:',
        saved_empty: 'You have no saved tests yet. Send a photo and the quiz will be saved automatically.',
        saved_hint: '💾 Quiz saved. Retake it anytime with /mytests',
        queue_wait: '⏳ You are in the queue: {n} requests ahead of you. Analysis will start automatically.',
        limit_reached: '⚠️ A test can have at most {max} questions. Extra photos were skipped — press the button to start. You can send the rest as a separate test.'
    }
};

// Telegram присылает коды вроде "en", "en-US", "ru", "uz" — берем первые две буквы.
// Если язык неизвестен, используем русский.
function getLang(langCode) {
    const short = String(langCode || '').toLowerCase().split('-')[0];
    return i18n[short] || i18n['ru'];
}

// ---------------- Хранилище сохранённых тестов (JSON-файл) ----------------
const SAVE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'saved_tests.json');
const MAX_SAVED_PER_USER = 10; // храним последние 10 наборов на пользователя

function loadAllSaved() {
    try {
        return JSON.parse(fs.readFileSync(SAVE_FILE, 'utf-8'));
    } catch (e) {
        return {}; // файла еще нет или он пустой
    }
}

function getUserSaved(userId) {
    return loadAllSaved()[userId] || [];
}

function saveQuizSet(userId, quizzes) {
    const all = loadAllSaved();
    const list = all[userId] || [];
    const set = { id: Date.now().toString(36), createdAt: new Date().toISOString(), quizzes };
    list.unshift(set); // новые — в начало
    all[userId] = list.slice(0, MAX_SAVED_PER_USER);
    fs.writeFileSync(SAVE_FILE, JSON.stringify(all, null, 2), 'utf-8');
    return set.id;
}

// Перемешивание ответов
function shuffleOptions(options, correctIndex) {
    let items = options.map((text, index) => ({ text, isCorrect: index === correctIndex }));
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
    const newCorrectIndex = items.findIndex(item => item.isCorrect);
    const newOptions = items.map(item => item.text);
    return { newOptions, newCorrectIndex };
}

const SYSTEM_PROMPT = `
Проанализируй скриншот теста. Найди основной вопрос и варианты ответов.
ОЧЕНЬ ВАЖНО: 
1. ИГНОРИРУЙ любые элементы интерфейса (шапки, меню, "Savol", "O'TDI", таймеры, кнопку "Keyingi").
2. Автоматически определи язык текста на фото. Сохрани оригинальный текст буква в букву без перевода. Обязательно сохраняй все апострофы (например, o', g').
3. Правильный вариант ответа визуально выделен.
Верни результат СТРОГО в формате JSON. Индекс правильного ответа начинается с 0.
Пример: {"question": "текст", "options": ["ответ 1", "ответ 2"], "correct_index": 1}
Верни ТОЛЬКО валидный JSON-код. Никаких пояснений и маркдауна.
`;

async function fetchImageForGemini(url) {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    return { inlineData: { data: Buffer.from(buffer).toString("base64"), mimeType: "image/jpeg" } };
}

// ---------------- Общая очередь запросов к Gemini ----------------
// Лимиты Google считаются на весь бот, а не на пользователя. Поэтому все запросы
// от всех пользователей идут по одному, с паузой между ними.
const GEMINI_INTERVAL_MS = Number(process.env.GEMINI_INTERVAL_MS) || 7000;
let geminiChain = Promise.resolve();
let geminiWaiting = 0;      // сколько запросов ждут своей очереди
let geminiBlockedUntil = 0; // если лимит исчерпан, до этого времени не шлем запросы

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function enqueueGemini(task) {
    geminiWaiting++;
    const run = geminiChain.then(async () => {
        geminiWaiting--;

        // Лимит недавно кончился — не тратим время на заведомо неудачные запросы
        if (Date.now() < geminiBlockedUntil) throw new Error("QUOTA_EXCEEDED");

        try {
            return await task();
        } catch (e) {
            if (e.message === "QUOTA_EXCEEDED") {
                // Дневной лимит — блокируем надолго, минутный — ненадолго
                geminiBlockedUntil = Date.now() + (e.daily ? 30 * 60 * 1000 : 60 * 1000);
            }
            throw e;
        } finally {
            await sleep(GEMINI_INTERVAL_MS); // пауза между запросами
        }
    });
    geminiChain = run.catch(() => {}); // ошибка одного запроса не ломает очередь
    return run;
}

// 1 ФАЗА: Функция распознавания ОДНОГО фото (с улучшенным парсером JSON и логами)
async function analyzeSinglePhoto(ctx, file_id, lang, attempt = 1) {
    try {
        const fileLink = await ctx.telegram.getFileLink(file_id);
        const imagePart = await fetchImageForGemini(fileLink.href);

        const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash-lite" });
        
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("API_TIMEOUT")), 120000));
        
        const result = await Promise.race([
            model.generateContent([SYSTEM_PROMPT, imagePart]),
            timeoutPromise
        ]);

        const responseText = result.response.text();
        
        // 1. Убираем маркдаун
        let cleanJson = responseText.replace(/```json|```/gi, '').trim();
        
        // 2. Ищем строго от первой { до последней } на случай лишнего текста вокруг
        const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            cleanJson = jsonMatch[0];
        }

        const testData = JSON.parse(cleanJson);

        const { newOptions, newCorrectIndex } = shuffleOptions(testData.options, testData.correct_index);

        return {
            question: testData.question.substring(0, 300),
            options: newOptions.slice(0, 10).map(opt => String(opt).substring(0, 100)),
            correct_index: newCorrectIndex
        };

    } catch (error) {
        // ТЕПЕРЬ МЫ ВИДИМ РЕАЛЬНУЮ ОШИБКУ В ТЕРМИНАЛЕ
        console.error(`[Попытка ${attempt}] Ошибка при парсинге фото:`, error.message);

        // Дневная квота исчерпана — повторять бессмысленно, сообщаем наверх сразу
        if (error.status === 429 && /PerDay|per day/i.test(error.message)) {
            const quotaError = new Error("QUOTA_EXCEEDED");
            quotaError.daily = true;
            throw quotaError;
        }

        // Ошибки API (429, 503, таймаут) повторяем с нарастающей паузой.
        const status = error.status;
        const isApiError = status === 429 || status === 503 || error.message === "API_TIMEOUT";

        if (isApiError && attempt < 3) {
            const delay = 5000 * attempt * attempt; // 5с, 20с
            console.log(`Повторная попытка ${attempt + 1} через ${delay / 1000}с (статус: ${status ?? error.message})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return analyzeSinglePhoto(ctx, file_id, lang, attempt + 1);
        }

        // Попытки закончились, а причина — лимит запросов
        if (status === 429) {
            throw new Error("QUOTA_EXCEEDED");
        }

        // Плохой JSON от нейросети — одна быстрая повторная попытка, чтобы не тратить квоту
        if (!isApiError && attempt < 2) {
            console.log(`Повторная попытка ${attempt + 1} (плохой ответ нейросети)...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            return analyzeSinglePhoto(ctx, file_id, lang, attempt + 1);
        }
        
        return null; // Если 3 раза подряд сбой — пропускаем фото
    }
}

// 1 ФАЗА: Фоновый процесс, который анализирует все фото и копит их в массив
async function processBatchBackground(ctx, userId, lang) {
    const session = userSessions.get(userId);
    const photosToProcess = session.photos;
    
    // Массив для готовых тестов
    session.parsedQuizzes = []; 
    let quotaExceeded = false;

    for (let i = 0; i < photosToProcess.length; i++) {
        // Если впереди уже есть очередь — предупреждаем пользователя
        if (i === 0 && geminiWaiting > 0) {
            await ctx.telegram.editMessageText(
                ctx.chat.id, session.messageId, undefined,
                lang.queue_wait.replace('{n}', geminiWaiting)
            ).catch(() => {});
        }

        let quizData = null;
        try {
            // Все запросы к Gemini идут через общую очередь
            quizData = await enqueueGemini(async () => {
                // Обновляем сообщение: "Анализирую 1 из 5..." — когда реально подошла очередь
                await ctx.telegram.editMessageText(
                    ctx.chat.id, session.messageId, undefined,
                    lang.analyzing_progress.replace('{current}', i + 1).replace('{total}', photosToProcess.length)
                ).catch(() => {});
                return analyzeSinglePhoto(ctx, photosToProcess[i], lang);
            });
        } catch (e) {
            if (e.message === "QUOTA_EXCEEDED") {
                quotaExceeded = true;
                break; // Дальше слать запросы нет смысла
            }
            throw e;
        }
        
        if (quizData) {
            session.parsedQuizzes.push(quizData); // Сохраняем успешно распознанный тест
        }
        
    }

    // Если ни одно фото не удалось распознать
    if (session.parsedQuizzes.length === 0) {
        const failText = quotaExceeded ? lang.quota_exceeded : lang.all_failed;
        await ctx.telegram.editMessageText(ctx.chat.id, session.messageId, undefined, failText);
        userSessions.delete(userId);
        return;
    }

    // Удаляем статус "Анализирую..."
    try {
        await ctx.telegram.deleteMessage(ctx.chat.id, session.messageId);
    } catch(e) {}

    // Лимит кончился посреди пачки — предупреждаем, но играем то, что успели распознать
    if (quotaExceeded) {
        await ctx.telegram.sendMessage(
            ctx.chat.id,
            lang.quota_partial
                .replace('{done}', session.parsedQuizzes.length)
                .replace('{total}', photosToProcess.length)
        ).catch(() => {});
    }

    // Сохраняем распознанные тесты, чтобы потом пройти их без обращения к Gemini
    try {
        saveQuizSet(userId, session.parsedQuizzes);
        session.justSaved = true;
    } catch (e) {
        console.error('Не удалось сохранить тесты:', e.message);
    }

    // Переводим пользователя в режим игры
    session.state = 'playing';
    session.currentIndex = 0;
    session.score = 0;

    // Выстреливаем первым вопросом
    sendNextQuiz(ctx.telegram, ctx.chat.id, userId);
}


// 2 ФАЗА: Моментальная отправка следующего теста из памяти
async function sendNextQuiz(telegram, chatId, userId) {
    const session = userSessions.get(userId);
    if (!session) return;
    
    const lang = getLang(session.langCode);

    // Конец тестов — выводим результат
    if (session.currentIndex >= session.parsedQuizzes.length) {
        const percent = Math.round((session.score / session.parsedQuizzes.length) * 100);
        let finishedText = lang.finished
            .replace('{score}', session.score)
            .replace('{total}', session.parsedQuizzes.length)
            .replace('{percent}', percent);
        if (session.justSaved) finishedText += '\n\n' + lang.saved_hint;
        await telegram.sendMessage(chatId, finishedText);
        userSessions.delete(userId); // Очищаем сессию
        return;
    }

    // Берем текущий вопрос из заранее подготовленных
    const currentQuiz = session.parsedQuizzes[session.currentIndex];

    // Отправляем
    const pollMsg = await telegram.sendQuiz(
        chatId,
        currentQuiz.question,
        currentQuiz.options,
        { correct_option_id: currentQuiz.correct_index, is_anonymous: false }
    );

    // Запоминаем ID сообщения для удаления
    session.currentPollMsgId = pollMsg.message_id;
    session.currentCorrectIndex = currentQuiz.correct_index;
    activePolls.set(pollMsg.poll.id, userId);
}

// ---------------- Обработчики Telegram ----------------

bot.start((ctx) => {
    ctx.reply(getLang(ctx.from?.language_code).start);
});

// Накопление фото
bot.on('photo', (ctx) => {
    const userId = ctx.from.id;
    const langCode = ctx.from?.language_code || 'ru';
    const lang = getLang(langCode);
    
    if (!userSessions.has(userId)) {
        userSessions.set(userId, { photos: [], parsedQuizzes: [], messageId: null, timer: null, state: 'collecting', langCode: langCode });
    }
    
    const session = userSessions.get(userId);

    if (session.state === 'playing' || session.state === 'analyzing') {
        return ctx.reply(lang.playing_error);
    }

    // Лимит вопросов в одном тесте
    if (session.photos.length >= MAX_QUESTIONS_PER_TEST) {
        if (!session.limitNotified) { // предупреждаем один раз, а не на каждое фото альбома
            session.limitNotified = true;
            ctx.reply(lang.limit_reached.replace('{max}', MAX_QUESTIONS_PER_TEST));
        }
        return;
    }

    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    session.photos.push(photo.file_id); 

    if (session.messageId) {
        ctx.telegram.deleteMessage(ctx.chat.id, session.messageId).catch(() => {});
        session.messageId = null;
    }

    clearTimeout(session.timer);
    session.timer = setTimeout(async () => {
        const text = lang.collected
            .replace('{count}', session.photos.length)
            .replace('{max}', MAX_QUESTIONS_PER_TEST);
        const keyboard = Markup.inlineKeyboard([Markup.button.callback(lang.generateBtn, 'start_generation')]);
        try {
            const msg = await ctx.reply(text, keyboard);
            session.messageId = msg.message_id;
        } catch (e) {}
    }, 1000);
});

// Нажатие кнопки
bot.action('start_generation', async (ctx) => {
    const userId = ctx.from.id;
    const session = userSessions.get(userId);
    const lang = getLang(session?.langCode || ctx.from?.language_code);

    if (!session || session.photos.length === 0) return ctx.answerCbQuery(lang.empty, { show_alert: true });

    await ctx.answerCbQuery();
    
    // Блокируем добавление новых фото
    session.state = 'analyzing';

    // Запускаем фоновый парсинг всех картинок разом
    processBatchBackground(ctx, userId, lang).catch(console.error);
});

// Обработка ответа на тест
bot.on('poll_answer', async (ctx) => {
    const pollId = ctx.pollAnswer.poll_id;
    const userId = ctx.pollAnswer.user.id;
    
    const expectedUserId = activePolls.get(pollId);
    if (expectedUserId !== userId) return;

    const session = userSessions.get(userId);
    if (!session || session.state !== 'playing') return;

    const selectedOption = ctx.pollAnswer.option_ids[0]; 

    if (selectedOption === session.currentCorrectIndex) {
        session.score += 1;
    }

    activePolls.delete(pollId); 

    // Задержка 2.5 секунды, чтобы пользователь увидел цвет ответа
    setTimeout(async () => {
        if (session.currentPollMsgId) {
            await ctx.telegram.deleteMessage(userId, session.currentPollMsgId).catch(()=>{});
        }
        
        session.currentIndex += 1;
        sendNextQuiz(ctx.telegram, userId, userId).catch(console.error); 
    }, 2500);
});

// Список сохранённых тестов
bot.command('mytests', (ctx) => {
    const lang = getLang(ctx.from?.language_code);
    const saved = getUserSaved(ctx.from.id);

    if (saved.length === 0) return ctx.reply(lang.saved_empty);

    const two = (n) => String(n).padStart(2, '0');
    const buttons = saved.map(set => {
        const d = new Date(set.createdAt);
        const date = `${two(d.getDate())}.${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`;
        return [Markup.button.callback(`📚 ${date} — ${set.quizzes.length}`, `play_saved:${set.id}`)];
    });

    ctx.reply(lang.saved_title, Markup.inlineKeyboard(buttons));
});

// Запуск сохранённого набора (Gemini не нужен)
bot.action(/^play_saved:(.+)$/, async (ctx) => {
    const userId = ctx.from.id;
    const langCode = ctx.from?.language_code || 'ru';
    const lang = getLang(langCode);
    const existing = userSessions.get(userId);

    if (existing && (existing.state === 'playing' || existing.state === 'analyzing')) {
        return ctx.answerCbQuery(lang.playing_error, { show_alert: true });
    }

    const set = getUserSaved(userId).find(item => item.id === ctx.match[1]);
    if (!set) return ctx.answerCbQuery(lang.saved_empty, { show_alert: true });

    await ctx.answerCbQuery();

    // Если пользователь начал собирать новые фото — сбрасываем, чтобы не было конфликта
    if (existing) clearTimeout(existing.timer);

    // Перемешиваем варианты заново, чтобы порядок не запоминался
    const quizzes = set.quizzes.map(q => {
        const { newOptions, newCorrectIndex } = shuffleOptions(q.options, q.correct_index);
        return { ...q, options: newOptions, correct_index: newCorrectIndex };
    });

    userSessions.set(userId, {
        photos: [], parsedQuizzes: quizzes, messageId: null, timer: null,
        state: 'playing', langCode: langCode, currentIndex: 0, score: 0
    });

    await ctx.deleteMessage().catch(() => {});
    sendNextQuiz(ctx.telegram, ctx.chat.id, userId).catch(console.error);
});

// Ошибка в одном обновлении не должна ронять бота для всех пользователей
bot.catch((err, ctx) => {
    console.error(`Ошибка обработчика (${ctx?.updateType}):`, err);
});
process.on('unhandledRejection', (reason) => console.error('Необработанная ошибка:', reason));

// Меню команд в Telegram (на языке интерфейса пользователя)
bot.telegram.setMyCommands([{ command: 'mytests', description: 'Мои сохранённые тесты' }]).catch(() => {});
bot.telegram.setMyCommands([{ command: 'mytests', description: 'Saqlangan testlarim' }], { language_code: 'uz' }).catch(() => {});
bot.telegram.setMyCommands([{ command: 'mytests', description: 'My saved tests' }], { language_code: 'en' }).catch(() => {});

bot.launch().catch((err) => {
    console.error('Не удалось запустить бота:', err.message);
    process.exit(1);
});
console.log('✅ Бот запущен! Архитектура: "Сначала анализ, затем игра" активна.');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));