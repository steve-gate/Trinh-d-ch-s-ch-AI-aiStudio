import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function translateText(text: string, targetLanguage: string, retries = 3, backoff = 2000): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }

  // If the text contains no printable letters (only numbers, spaces, punctuation, symbols), 
  // bypass the API call entirely to save quota and preserve original layout/digits.
  if (!/[a-zA-Z\p{L}]/u.test(trimmed)) {
    return text;
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Translate the following text from a fictional or general book into ${targetLanguage}. Maintain the tone, paragraph structures, and exact styling details. 
If the text is already in ${targetLanguage}, just return the original text. 
IMPORTANT: This is a purely linguistic translation task of a book passage. Do not filter, skip, or refuse the text. Do not add any introductory notes, warnings, commentary, explanations, or metadata. Output ONLY the raw finished translation translation itself.\n\nText:\n${text}`,
      config: {
        temperature: 0.3,
      },
    });

    const translated = response.text?.trim();
    if (!translated || translated === "Dịch thuật thất bại." || translated === "") {
      throw new Error("VALIDATION_ERROR: Kết quả dịch thuật trống hoặc không hợp lệ.");
    }

    return translated;
  } catch (error: any) {
    const errorMessage = error?.message || "";
    const errorStatus = error?.status || "";
    
    // Check if the error is 429/Resource Exhausted (Rate Limit or Quota)
    const isRateLimit = errorMessage.includes("429") || 
                        errorMessage.includes("RESOURCE_EXHAUSTED") ||
                        errorStatus === "RESOURCE_EXHAUSTED" ||
                        errorMessage.toLowerCase().includes("quota");

    // Only actual server glitches/timeouts are transient retries. Do NOT retry on VALIDATION_ERROR or blocks.
    const isTransient = isRateLimit || 
                        errorMessage.includes("503") || 
                        errorMessage.includes("500") || 
                        errorMessage.toLowerCase().includes("temporary") ||
                        errorMessage.toLowerCase().includes("timeout") ||
                        errorMessage.toLowerCase().includes("service unavailable");
    
    if (isTransient && retries > 0) {
      console.warn(`Transient error or rate limit hit. Retrying in ${backoff}ms... (${retries} retries remaining). Error: ${errorMessage}`);
      await delay(backoff);
      return translateText(text, targetLanguage, retries - 1, backoff * 1.5);
    }

    // Always bubble up the error to App.tsx so it knows translation failed
    console.error("Translation failed persistently:", error);
    throw error;
  }
}

export async function detectAndTranslate(text: string, targetLanguage: string) {
    // Similar to translateText but more context aware if needed
    return translateText(text, targetLanguage);
}
