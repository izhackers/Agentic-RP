export enum Role {
  USER = 'user',
  MODEL = 'model',
  SYSTEM = 'system'
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: Date;
  attachment?: string; // Base64 string for image uploads in chat
}

export interface RPDocument {
  id: string;
  name: string;
  content: string; // Base64 string for PDF, raw text for text files
  mimeType: string; // 'application/pdf' or 'text/plain'
}

export interface AppState {
  messages: Message[];
  isLoading: boolean;
  documents: RPDocument[]; // Support multiple documents
}