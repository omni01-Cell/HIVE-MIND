import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';

async function test() {
    const genAI = new GoogleGenerativeAI(process.env.VOTRE_CLE_GEMINI || '');
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    try {
        const result = await model.generateContent("Hello, are you working?");
        console.log("✅ Gemini Response:", result.response.text());
    } catch (e: any) {
        console.error("❌ Gemini Error:", e.message);
    }
}

test();
