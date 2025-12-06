import { GoogleGenAI, Content, Part } from "@google/genai";
import { Message, Role, RPDocument } from "../types";
import { AGEN_RP_SYSTEM_INSTRUCTION } from "../constants";

export const createClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found in environment variables");
  }
  return new GoogleGenAI({ apiKey });
};

export const sendMessageToGemini = async (
  history: Message[],
  newMessage: string,
  documents: RPDocument[],
  imageAttachment?: string
): Promise<string> => {
  const ai = createClient();
  
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

  // 3. Append Text Documents content directly to System Instruction (safe context handling)
  if (textDocs.length > 0) {
    systemInstructionText += `\n\n--- KANDUNGAN TEKS DOKUMEN RUJUKAN ---`;
    textDocs.forEach((doc, index) => {
      systemInstructionText += `\n\nDOKUMEN ${index + 1}: ${doc.name}\n${doc.content}`;
    });
    systemInstructionText += `\n\n--- TAMAT KANDUNGAN TEKS ---`;
  }

  // 4. Construct Chat History
  // We need to map our Message type to the API Content type
  // Note: We exclude the *current* message from history because we pass it to sendMessage
  const chatHistory: Content[] = history.map(msg => {
    const parts: Part[] = [];
    
    // Check if previous history messages had attachments
    if (msg.attachment) {
       const base64Data = msg.attachment.split(',')[1]; // Remove data:image/xxx;base64,
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

  // 5. Inject PDFs as "Inline Data" in the very first user message (or system equivalent)
  // To ensure the model has access to the PDFs throughout.
  if (pdfDocs.length > 0) {
    const pdfParts = pdfDocs.map(doc => {
      // Clean base64 string
      const base64Data = doc.content.replace(/^data:application\/pdf;base64,/, '');
      return {
        inlineData: {
          mimeType: 'application/pdf',
          data: base64Data
        }
      };
    });

    // We need to insert this into the history.
    // If history is empty, this will be part of the first turn implicitly? 
    // No, we must add it to the history passed to chat.create
    const contextMessage: Content = {
      role: 'user',
      parts: [
        { text: `Berikut adalah fail-fail rujukan Rancangan Pemajuan (PDF) yang perlu anda rujuk (${pdfDocs.length} fail). Sila gunakan maklumat visual dan teks daripada fail-fail ini untuk menjawab soalan.` },
        ...pdfParts
      ]
    };

    // Prepend to history
    chatHistory.unshift(contextMessage);
  }

  try {
    const model = "gemini-2.5-flash"; 
    
    const chat = ai.chats.create({
      model: model,
      config: {
        systemInstruction: systemInstructionText,
        temperature: 0.3, 
      },
      history: chatHistory
    });

    // Prepare the current message payload
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
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return "Maaf, terdapat masalah teknikal semasa memproses permintaan anda (Ralat Sambungan/Token). Sila cuba lagi.";
  }
};