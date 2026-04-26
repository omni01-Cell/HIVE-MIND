import Groq from 'groq-sdk';
import 'dotenv/config';

async function test() {
    const groq = new Groq({ apiKey: process.env.VOTRE_CLE_GROQ || '' });
    try {
        const result = await groq.chat.completions.create({
            messages: [{ role: 'user', content: 'Hi' }],
            model: 'llama-3.3-70b-versatile',
        });
        console.log("✅ Groq Response:", result.choices[0]?.message?.content);
    } catch (e: any) {
        console.error("❌ Groq Error:", e.message);
    }
}

test();
