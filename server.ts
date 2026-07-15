import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // API proxy route
  app.post("/api/gemini", async (req, res) => {
    try {
      const { apiKey, model, contents, config } = req.body;
      const keyToUse = (apiKey && apiKey.trim() !== "") ? apiKey : process.env.GEMINI_API_KEY;
      if (!keyToUse) {
        return res.status(400).json({ error: "Yêu cầu API key. Vui lòng nhập key trong Cài đặt hoặc cấu hình biến môi trường." });
      }

      const modelToUse = model || "gemini-3.5-flash";
      console.log("Received request for model:", modelToUse);
      
      const ai = new GoogleGenAI({ 
        apiKey: keyToUse,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
      const response = await ai.models.generateContent({
        model: modelToUse,
        contents,
        config
      });
      
      console.log("Gemini API response:", JSON.stringify(response));
      
      let text = response.text;
      
      // If response.text is empty, check candidates and their finishReasons
      if (!text || text.trim() === "") {
        const candidate = response.candidates?.[0];
        if (candidate) {
          const finishReason = candidate.finishReason;
          if (finishReason === "SAFETY") {
            const blockedCategory = candidate.safetyRatings?.find((r: any) => r.blocked)?.category || "Không xác định";
            return res.status(400).json({ 
              error: `Nội dung bị chặn bởi bộ lọc an toàn của Gemini (Lý do: SAFETY, Phân loại: ${blockedCategory}).` 
            });
          } else if (finishReason === "RECITATION") {
            return res.status(400).json({
              error: "Nội dung bị chặn do lo ngại bản quyền (Lý do: RECITATION)."
            });
          } else if (finishReason && finishReason !== "STOP") {
            return res.status(400).json({
              error: `Dịch thuật không thành công (Lý do: ${finishReason}).`
            });
          }
        }
        
        // Check promptFeedback
        if (response.promptFeedback?.blockReason) {
          return res.status(400).json({
            error: `Nội dung yêu cầu bị chặn bởi bộ lọc an toàn (Yêu cầu gốc bị chặn: ${response.promptFeedback.blockReason}).`
          });
        }

        // Default empty response fallback
        return res.status(400).json({
          error: "Không nhận được kết quả dịch từ mô hình Gemini (Kết quả trống)."
        });
      }

      res.json({ text });
    } catch (error: any) {
      console.error("Gemini API Error:", error.message, error.status, error.code);
      
      let statusCode = 500;
      if (typeof error.status === 'number') {
        statusCode = error.status;
      } else if (typeof error.code === 'number') {
        statusCode = error.code;
      }

      res.status(statusCode).json({ 
        error: error.message || "Lỗi không xác định từ Gemini API",
        status: error.status || statusCode
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  
  app.use((err: any, req: any, res: any, next: any) => {
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: "Dữ liệu gửi lên quá lớn (vượt quá 50MB). Vui lòng giảm kích thước văn bản hoặc sách." });
    }
    res.status(err.status || 500).json({ error: err.message || "Lỗi máy chủ" });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
