import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function translateText(text: string, targetLanguage: string, retries = 3, backoff = 2000): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Translate the following text from a book into ${targetLanguage}. Maintain the tone and nuances of the original text. If it is already in ${targetLanguage}, just return the original text. Avoid adding any commentary or explanations. Output only the translated text.\n\nText:\n${text}`,
      config: {
        temperature: 0.3,
      },
    });

    return response.text || "Dịch thuật thất bại.";
  } catch (error: any) {
    // Check for 429 (Rate Limit) error
    const isRateLimit = error?.message?.includes("429") || error?.status === "RESOURCE_EXHAUSTED";
    
    if (isRateLimit && retries > 0) {
      console.warn(`Rate limit hit. Retrying in ${backoff}ms... (${retries} retries left)`);
      await delay(backoff);
      return translateText(text, targetLanguage, retries - 1, backoff * 2);
    }

    console.error("Translation error:", error);
    throw error;
  }
}

export async function detectAndTranslate(text: string, targetLanguage: string) {
    // Similar to translateText but more context aware if needed
    return translateText(text, targetLanguage);
}
