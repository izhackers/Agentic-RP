import { GoogleGenAI, Content, Part } from "@google/genai";
import { Message, Role, RPDocument } from "../types";
import { AGEN_RP_SYSTEM_INSTRUCTION } from "../constants";

// ============================================================================
// ⚠️ PANDUAN KESELAMATAN API KEY
// Jangan letak API Key di sini jika anda upload ke GitHub (Public Repo).
// Google akan mengesan dan mematikan key tersebut (Leaked Key).
//
// CARA SELAMAT:
// 1. Biarkan variable di bawah KOSONG string kosong "".
// 2. Buka aplikasi di browser -> Klik ikon Gear (Tetapan).
// 3. Masukkan API Key secara manual di menu tersebut.
// ============================================================================
const HARDCODED_API_KEY = ""; 
// ============================================================================

// Fungsi mudah untuk mendapatkan API Key
const getApiKey = (manualKey?: string): string => {
  // 1. Cek key yang dimasukkan manual dari UI (Butang Gear) - INI UTAMA
  if (manualKey && manualKey.trim() !== "") {
    return manualKey;
  }

  // 2. Cek LocalStorage (jika user refresh page, key masih ada di browser)
  try {
    const storedKey = localStorage.getItem("gemini_api_key");
    if (storedKey) return storedKey;
  } catch (e) {
    // Abaikan ralat security (jika iframe/embed menghalang access storage)
  }

  // 3. Cek Hardcoded Key (Hanya untuk testing localhost, jangan commit ke github)
  const hardcoded = HARDCODED_API_KEY as string;
  if (hardcoded && hardcoded.trim() !== "") {
    return hardcoded;
  }

  return "";
};

export const createClient = (manualKey?: string) => {
  const apiKey = getApiKey(manualKey);
  
  if (!apiKey) {
    // Return null supaya UI boleh handle error "Key Missing"
    return null; 
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

    if (!ai) {
      throw new Error("MISSING_KEY");
    }
    
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

    // Menggunakan gemini-2.5-flash untuk kestabilan & kos efektif
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
    
    let errorMessage = error.message || JSON.stringify(error);
    
    if (errorMessage.includes("MISSING_KEY")) {
       return `⚠️ **API Key Diperlukan**\n\nSila klik butang **Tetapan (Gear)** di penjuru atas kanan dan masukkan API Key anda.\n\n(Disebabkan isu keselamatan, kami tidak menyimpan API Key dalam kod sistem).`;
    }
    
    // Handle specific Google API errors for better UX
    if (errorMessage.includes("403")) {
      errorMessage = "API Key ditolak. Kunci mungkin telah tamat tempoh, salah, atau disekat (Leaked). Sila jana kunci baru.";
    } else if (errorMessage.includes("429")) {
      errorMessage = "Kuota penggunaan API telah habis (Quota Exceeded). Sila cuba sebentar lagi.";
    } else if (errorMessage.includes("400")) {
      errorMessage = "Permintaan tidak sah (Bad Request). Sila semak fail atau input anda.";
    }

    return `⚠️ RALAT TEKNIKAL: ${errorMessage}`;
  }
};