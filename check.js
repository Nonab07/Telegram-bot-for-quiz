import 'dotenv/config';

async function checkModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();
    
    console.log("Доступные модели для твоего ключа:");
    if (data.models) {
        data.models.forEach(m => console.log(m.name));
    } else {
        console.log("Ошибка доступа к API:", data);
    }
}

checkModels();