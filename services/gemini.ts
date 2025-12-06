import { GoogleGenAI, Content, Part } from "@google/genai";
import { Message, Role, RPDocument } from "../types";
import { AGEN_RP_SYSTEM_INSTRUCTION } from "../constants";

// ============================================================================
// ⚠️ RUANG KHAS API KEY (MANUAL)
// Sila paste API Key anda dari Google AI Studio di dalam tanda petikan di bawah.
// ============================================================================
const HARDCODED_API_KEY = "AIzaSyBaUcLalRkKh2h5GsKBLfX7A47DXxFEu8E"; // <--- PASTE KEY DI SINI (Contoh: "AIzaSy...")
// ============================================================================

// Fungsi selamat untuk mendapatkan API Key dari pelbagai sumber
const getApiKey = (manualKey?: string): string => {
  // 1. Cek Hardcoded Key (Paling Utama - jika pengguna isi di atas)
  // Fix: Cast to string to prevent TypeScript from narrowing to 'never' on empty literal
  const hardcoded = HARDCODED_API_KEY as string;
  if (hardcoded && hardcoded.trim() !== "") {
    return hardcoded;
  }

  // 2. Cek key yang dimasukkan manual dari UI (Butang Gear)
  if (manualKey && manualKey.trim() !== "") {
    return manualKey;
  }

  // 3. Cek LocalStorage
  try {
    const storedKey = localStorage.getItem("gemini_api_key");
    if (storedKey) return storedKey;
  } catch (e) {
    // Abaikan ralat akses localStorage
  }

  // 4. Cek Environment Variables (Vite/Vercel standard)
  // Menggunakan try-catch yang ketat untuk mengelakkan "process is not defined" crash
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_KEY) {
      // @ts-ignore
      return import.meta.env.VITE_API_KEY;
    }
  } catch (e) {
    // Ignore error
  }

  try {
    // @ts-ignore
    if (typeof process !== 'undefined' && process.env) {
      // @ts-ignore
      if (process.env.API_KEY) return process.env.API_KEY;
      // @ts-ignore
      if (process.env.NEXT_PUBLIC_API_KEY) return process.env.NEXT_PUBLIC_API_KEY;
    }
  } catch (e) {
    // Abaikan ralat 'process is not defined'
  }

  return "";
};

export const createClient = (manualKey?: string) => {
  const apiKey = getApiKey(manualKey);
  
  if (!apiKey) {
    throw new Error("API Key tidak dijumpai. Sila paste key di dalam fail services/gemini.ts (HARDCODED_API_KEY) atau masukkan di butang Tetapan.");
  }
  return new GoogleGenAI({ apiKey });
};

export const sendMessageToGemini = async (
  history: Message[],
  newMessage: string,
  documents: RPDocument[],
  imageAttachment?: string,
  manualApiKey?: string // Terima key dari UI
): Promise<string> => {
  
  try {
    const ai = createClient(manualApiKey);
    
    // 1. Prepare System Instruction
    let systemInstructionText = `${AGEN_RP_SYSTEM_INSTRUCTION}

============================================================
📂 STATUS DOKUMEN RUJUKAN
============================================================`;

    const docNames = documents.map(d => d.name).join(", ");
    if (documents.length > 0) {
      systemInstructionText += `\nDokumen berikut telah dimuat naik untuk rujukan: ${docNames}`;
    } else {
      systemInstructionText += `\n[TIADA DOKUMEN DIMUAT NAIK. JAWAB BAHAWA MAKLUMAT TIDAK DAPAT DISAHKAN TANPA DOKUMEN.]`;
    }

    // 2. Separate Text docs and PDF docs
    const textDocs = documents.filter(d => d.mimeType === 'text/plain');
    const pdfDocs = documents.filter(d => d.mimeType === 'application/pdf');

    // 3. Append Text Documents content directly to System Instruction
    if (textDocs.length > 0) {
      systemInstructionText += `\n\n--- KANDUNGAN TEKS DOKUMEN RUJUKAN ---`;
      textDocs.forEach((doc, index) => {
        systemInstructionText += `\n\nDOKUMEN ${index + 1}: ${doc.name}\n${doc.content}`;
      });
      systemInstructionText += `\n\n--- TAMAT KANDUNGAN TEKS ---`;
    }

    // 4. Construct Chat History
    const chatHistory: Content[] = history.map(msg => {
      const parts: Part[] = [];
      
      if (msg.attachment) {
         const base64Data = msg.attachment.split(',')[1];
         const mimeType = msg.attachment.split(';')[0].split(':')[1];
         parts.push({
           inlineData: {
             mimeType: mimeType,
             data: base64Data
           }
         });
      }
      
      parts.push({ text: msg.content });

      return {
        role: msg.role === Role.USER ? 'user' : 'model',
        parts: parts
      };
    });

    // 5. Inject PDFs as "Inline Data"
    if (pdfDocs.length > 0) {
      const pdfParts = pdfDocs.map(doc => {
        const base64Data = doc.content.replace(/^data:application\/pdf;base64,/, '');
        return {
          inlineData: {
            mimeType: 'application/pdf',
            data: base64Data
          }
        };
      });

      const contextMessage: Content = {
        role: 'user',
        parts: [
          { text: `Berikut adalah fail-fail rujukan Rancangan Pemajuan (PDF) yang perlu anda rujuk (${pdfDocs.length} fail). Sila gunakan maklumat visual dan teks daripada fail-fail ini untuk menjawab soalan.` },
          ...pdfParts
        ]
      };
      chatHistory.unshift(contextMessage);
    }

    const model = "gemini-2.5-flash"; 
    
    const chat = ai.chats.create({
      model: model,
      config: {
        systemInstruction: systemInstructionText,
        temperature: 0.3, 
      },
      history: chatHistory
    });

    let messagePayload: string | Part[] = newMessage;
    
    if (imageAttachment) {
      const base64Data = imageAttachment.split(',')[1];
      const mimeType = imageAttachment.split(';')[0].split(':')[1];
      messagePayload = [
        { text: newMessage },
        { 
          inlineData: {
            mimeType: mimeType,
            data: base64Data
          }
        }
      ];
    }

    const response = await chat.sendMessage({
      message: messagePayload
    });

    return response.text || "Maaf, saya tidak dapat menjana jawapan pada masa ini.";
  } catch (error: any) {
    console.error("Error calling Gemini API:", error);
    
    // Friendly error message handling
    if (error.message.includes("API Key")) {
      return "RALAT API KEY: Sila masukkan API Key dalam fail 'services/gemini.ts' (hardcoded) atau di butang Tetapan.";
    }
    return "Maaf, terdapat masalah teknikal semasa memproses permintaan anda. Sila pastikan API Key adalah sah.";
  }
};