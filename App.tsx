import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import ChatBubble from './components/ChatBubble';
import DocumentUploader from './components/DocumentUploader';
import { Message, Role, RPDocument } from './types';
import { sendMessageToGemini } from './services/gemini';
import { EXAMPLE_QUESTIONS, INITIAL_WELCOME_MESSAGE, CONNECTION_ERROR_MESSAGE, APP_NAME, APP_SUBTITLE, DISCLAIMER_TEXT } from './constants';

const App: React.FC = () => {
  // Enhanced Embed Mode Detection
  // Changed: Now ONLY checks URL param ?mode=embed. 
  // Removed auto-detection (window.self !== window.top) because it hides UI in preview environments.
  const [isEmbedMode, setIsEmbedMode] = useState(false);

  useEffect(() => {
    const checkEmbedStatus = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const modeParam = urlParams.get('mode') === 'embed';
      
      // Only switch to embed mode if explicitly requested via URL
      if (modeParam) {
        setIsEmbedMode(true);
      }
    };
    checkEmbedStatus();
  }, []);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: Role.MODEL,
      content: INITIAL_WELCOME_MESSAGE,
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // State for multiple documents
  const [documents, setDocuments] = useState<RPDocument[]>([]);
  
  // State for image attachment
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  
  // State for Settings Modal (Embed Mode)
  const [showSettings, setShowSettings] = useState(false);

  // State for Manual API Key
  const [apiKey, setApiKey] = useState('');

  // State for Toast Notification
  const [toast, setToast] = useState<{show: boolean, message: string}>({show: false, message: ''});

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check if current environment is a temporary preview (Google IDX/AI Studio)
  const isPreviewEnv = typeof window !== 'undefined' && (
    window.location.hostname.includes('googleusercontent') || 
    window.location.hostname.includes('webcontainer') ||
    window.location.hostname.includes('scf')
  );

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load API Key from LocalStorage on mount
  useEffect(() => {
    try {
      const storedKey = localStorage.getItem("gemini_api_key");
      if (storedKey) setApiKey(storedKey);
    } catch (error) {
      console.warn("Storage access restricted (iframe/incognito mode).", error);
    }
  }, []);

  // Save API Key to LocalStorage
  const handleSaveApiKey = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newKey = e.target.value;
    setApiKey(newKey);
    try {
      localStorage.setItem("gemini_api_key", newKey);
    } catch (error) {
      console.warn("Storage access restricted. Key will strictly be in-memory.", error);
    }
  };

  // Toast Helper
  const showToast = (message: string) => {
    setToast({show: true, message});
    setTimeout(() => setToast({show: false, message: ''}), 3000);
  };

  // Handler for adding new documents
  const handleAddDocuments = (files: File[]) => {
    let processedCount = 0;
    const newDocs: RPDocument[] = [];

    files.forEach(file => {
      const isPdf = file.type === 'application/pdf';
      const isText = file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.md');

      if (!isPdf && !isText) {
        alert(`Fail "${file.name}" tidak disokong. Sila guna PDF atau TXT.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        newDocs.push({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          name: file.name,
          content: content,
          mimeType: isPdf ? 'application/pdf' : 'text/plain'
        });
        
        processedCount++;
        if (processedCount === files.length) {
          // All files processed, update state
          setDocuments(prev => [...prev, ...newDocs]);
          
          setMessages(prev => [
            ...prev,
            {
              id: Date.now().toString(),
              role: Role.SYSTEM,
              content: `${newDocs.length} dokumen telah ditambah. Jumlah dokumen aktif: ${documents.length + newDocs.length}.`,
              timestamp: new Date()
            }
          ]);
        }
      };

      if (isPdf) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });
  };

  // Handler for removing a document
  const handleRemoveDocument = (id: string) => {
    setDocuments(prev => prev.filter(doc => doc.id !== id));
  };

  // Handler for image attachment
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.type.startsWith('image/')) {
        alert('Sila muat naik fail imej sahaja (JPG/PNG).');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        setSelectedImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
      // Reset input value to allow re-selecting same file
      e.target.value = '';
    }
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
  };

  // Generate a clean transcript string
  const generateTranscript = () => {
    if (messages.length <= 1) return ""; // Only welcome message

    return messages
      .filter(m => m.role !== Role.SYSTEM)
      .map(m => {
        const time = m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const sender = m.role === Role.USER ? 'Pengguna' : 'Agen RP Maya';
        const attachment = m.attachment ? '[Gambar dilampirkan]\n' : '';
        // Clean markdown a bit for plain text if needed, but keeping it raw is usually fine
        return `[${time}] ${sender}:\n${attachment}${m.content}`;
      })
      .join('\n\n------------------------\n\n');
  };

  const handleShare = async () => {
    const transcript = generateTranscript();
    
    if (!transcript) {
      showToast("Tiada perbualan untuk dikongsi.");
      return;
    }

    const shareData = {
      title: `Transkrip Chat - ${APP_NAME}`,
      text: transcript,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        showToast("Menu kongsi dibuka.");
      } catch (err) {
        console.log('Error sharing:', err);
      }
    } else {
      try {
        await navigator.clipboard.writeText(transcript);
        showToast("Transkrip perbualan berjaya disalin!");
      } catch (err) {
        console.error('Copy failed', err);
        showToast("Gagal menyalin transkrip.");
      }
    }
  };

  const handleCopyEmbedLink = async () => {
    // Construct current URL with ?mode=embed
    const baseUrl = window.location.origin + window.location.pathname;
    const embedUrl = `${baseUrl}?mode=embed`;
    
    try {
      await navigator.clipboard.writeText(embedUrl);
      showToast("Pautan Embed disalin!");
    } catch (err) {
      showToast("Gagal menyalin pautan.");
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && !selectedImage) || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: Role.USER,
      content: input,
      timestamp: new Date(),
      attachment: selectedImage || undefined
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    const currentImage = selectedImage; // Store ref to current image to pass to API
    setSelectedImage(null); // Clear preview immediately
    setIsLoading(true);

    try {
      // Pass apiKey manually if set in settings
      const reply = await sendMessageToGemini(messages, input, documents, currentImage || undefined, apiKey);
      
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: Role.MODEL,
        content: reply,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error("Failed to send message", error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: Role.SYSTEM,
        content: CONNECTION_ERROR_MESSAGE,
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={`flex flex-col h-screen font-sans text-slate-800 relative ${isEmbedMode ? 'bg-white' : 'bg-slate-100'}`}>
      {!isEmbedMode && <Header onShare={handleShare} onOpenSettings={() => setShowSettings(true)} />}
      
      <main className="flex-1 flex overflow-hidden max-w-7xl mx-auto w-full p-4 gap-4">
        
        {/* Sidebar - Info & Upload (Hidden in Embed Mode) */}
        {!isEmbedMode && (
          <aside className="hidden md:flex flex-col w-1/3 lg:w-1/4 h-full gap-4">
            {/* 
               REMOVED DocumentUploader from here as requested. 
               Users should use Settings button to upload documents. 
            */}
            
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex-1 overflow-y-auto">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Contoh Pertanyaan</h3>
              <ul className="space-y-2">
                {EXAMPLE_QUESTIONS.map((q, i) => (
                  <li 
                    key={i} 
                    className="text-xs p-2 bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-700 rounded cursor-pointer transition-colors border border-slate-100"
                    onClick={() => setInput(q)}
                  >
                    {q}
                  </li>
                ))}
              </ul>

              <div className="mt-6 pt-4 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">PENAFIAN</h4>
                <p className="text-[10px] text-slate-400 leading-tight text-justify whitespace-pre-wrap">
                  {DISCLAIMER_TEXT}
                </p>
              </div>
            </div>
          </aside>
        )}

        {/* Chat Area */}
        <section className={`flex-1 flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative ${isEmbedMode ? 'w-full' : ''}`}>
          
          {/* Admin & Share Buttons (Embed Mode Only) */}
          {isEmbedMode && (
            <div className="absolute top-2 right-2 z-20 flex space-x-2">
              <button 
                onClick={handleShare}
                className="p-2 text-slate-400 hover:text-blue-600 bg-slate-50 border border-slate-200 hover:border-blue-300 rounded-full transition-all shadow-sm"
                title="Kongsi Transkrip"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path d="M13 4.5a2.5 2.5 0 1 1 .702 1.737L6.97 9.604a2.518 2.518 0 0 1 0 .792l6.733 3.367a2.5 2.5 0 1 1-.671 1.341l-6.733-3.367a2.5 2.5 0 1 1 0-3.475l6.733-3.366A2.52 2.52 0 0 1 13 4.5Z" />
                </svg>
              </button>

              <button 
                onClick={() => setShowSettings(true)}
                className="p-2 text-slate-400 hover:text-blue-600 bg-slate-50 border border-slate-200 hover:border-blue-300 rounded-full transition-all shadow-sm"
                title="Tetapan Admin (Upload Dokumen)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
              </button>
            </div>
          )}

          {/* Mobile Upload Warning (If doc not uploaded) - Hidden in Embed Mode */}
          {!isEmbedMode && (
            <div className="md:hidden p-2 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
               <span className="text-xs font-semibold text-slate-600">
                  {documents.length > 0 ? `${documents.length} Fail Dimuat Naik` : "Tiada Dokumen Rujukan"}
               </span>
               <button 
                  onClick={() => setShowSettings(true)}
                  className="text-xs bg-blue-600 text-white px-3 py-1 rounded cursor-pointer"
               >
                  Tetapan / Upload
               </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50 scroll-smooth">
            {messages.map((msg) => (
               msg.role !== Role.SYSTEM && <ChatBubble key={msg.id} message={msg} />
            ))}
            
            {messages.filter(m => m.role === Role.SYSTEM).length > 0 && messages[messages.length-1].role === Role.SYSTEM && (
               <div className="flex justify-center my-4">
                  <span className="text-xs text-slate-400 bg-slate-200 px-3 py-1 rounded-full">
                    {messages[messages.length-1].content}
                  </span>
               </div>
            )}

            {isLoading && (
              <div className="flex w-full justify-start mb-4 animate-pulse">
                <div className="flex flex-row items-center bg-white border border-slate-200 p-4 rounded-2xl rounded-tl-none space-x-2">
                   <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms'}}></div>
                   <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms'}}></div>
                   <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms'}}></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 bg-white border-t border-slate-200">
            
            {/* Image Preview */}
            {selectedImage && (
              <div className="flex items-center gap-2 mb-2 p-2 bg-slate-50 rounded-lg w-fit border border-blue-100">
                <img src={selectedImage} alt="Preview" className="h-12 w-12 object-cover rounded" />
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-slate-700">Gambar dipilih</span>
                  <button 
                    onClick={handleRemoveImage}
                    className="text-[10px] text-red-500 hover:text-red-700 text-left"
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-end space-x-2">
              {/* Attachment Button */}
              <button
                onClick={() => imageInputRef.current?.click()}
                disabled={isLoading}
                className={`p-3 rounded-xl flex-shrink-0 transition-all ${
                  isLoading ? 'bg-slate-100 text-slate-300' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-blue-600'
                }`}
                title="Muat naik gambar"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                </svg>
                <input 
                  type="file" 
                  ref={imageInputRef} 
                  accept="image/png, image/jpeg, image/jpg, image/webp" 
                  className="hidden" 
                  onChange={handleImageSelect}
                />
              </button>

              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={documents.length > 0 ? "Taip soalan atau hantar gambar peta..." : "Sila muat naik dokumen RP dahulu..."}
                className="flex-1 bg-slate-100 border-0 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:bg-white resize-none max-h-32 min-h-[50px] text-sm"
                rows={1}
                disabled={isLoading}
              />
              <button
                onClick={handleSend}
                disabled={isLoading || (!input.trim() && !selectedImage)}
                className={`p-3 rounded-xl flex-shrink-0 transition-all ${
                  isLoading || (!input.trim() && !selectedImage)
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                  : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md hover:shadow-lg'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                </svg>
              </button>
            </div>
            <div className="text-center mt-2">
                <p className="text-[10px] text-slate-400">Dikuasakan oleh Gemini 2.5 Flash • Sokongan Analisis Gambar & Dokumen</p>
            </div>
          </div>

        </section>
      </main>

      {/* Admin Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col overflow-hidden animate-fade-in-up">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-semibold text-slate-800">Tetapan Admin</h3>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto space-y-6">
              
              {/* Embed Link Generator */}
              <div className={`border rounded-lg p-3 ${isPreviewEnv ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-100'}`}>
                 <h4 className={`text-xs font-bold uppercase mb-2 ${isPreviewEnv ? 'text-red-800' : 'text-green-800'}`}>
                    Pautan Embed (ArcGIS StoryMap)
                 </h4>
                 <p className={`text-[10px] mb-2 ${isPreviewEnv ? 'text-red-700' : 'text-green-700'}`}>
                    {isPreviewEnv 
                      ? "⚠️ AMARAN: Ini adalah pautan PREVIEW (sementara). Sila buka App di Vercel (.vercel.app) untuk dapatkan link sebenar." 
                      : "Gunakan pautan ini di dalam ArcGIS StoryMap (Embed Block) untuk memaparkan ruang chat sahaja."
                    }
                 </p>
                 <div className="flex gap-2">
                   <input 
                     type="text" 
                     readOnly
                     value={`${window.location.origin}${window.location.pathname}?mode=embed`}
                     className={`flex-1 text-[10px] p-2 rounded border bg-white text-slate-500 ${isPreviewEnv ? 'border-red-200' : 'border-green-200'}`}
                   />
                   <button 
                     onClick={handleCopyEmbedLink}
                     className={`px-3 py-1 rounded text-xs text-white flex items-center ${isPreviewEnv ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
                   >
                     Salin
                   </button>
                 </div>
              </div>

              {/* API Key Section */}
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                <h4 className="text-xs font-bold text-blue-800 uppercase mb-2">Konfigurasi API Key</h4>
                <p className="text-[10px] text-blue-600 mb-2">
                   Masukkan Gemini API Key anda. Ia akan disimpan dalam pelayar (Local Storage) untuk sesi ini.
                </p>
                <div className="flex gap-2">
                  <input 
                    type="password"
                    placeholder="Tampal API Key di sini..."
                    value={apiKey}
                    onChange={handleSaveApiKey}
                    className="flex-1 text-xs p-2 rounded border border-blue-200 focus:outline-none focus:border-blue-500"
                  />
                  {apiKey && (
                    <button 
                      onClick={() => {
                        setApiKey('');
                        try {
                          localStorage.removeItem("gemini_api_key");
                        } catch(e) { console.warn("Storage restricted", e); }
                      }}
                      className="bg-red-100 text-red-600 px-3 py-1 rounded text-xs hover:bg-red-200"
                      title="Padam Key"
                    >
                      Padam
                    </button>
                  )}
                </div>
                <div className="mt-2 text-[10px] text-right">
                  <a 
                    href="https://aistudio.google.com/app/apikey" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline inline-flex items-center"
                  >
                    Dapatkan API Key di sini
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 ml-1">
                      <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 2 14.75v-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Z" clipRule="evenodd" />
                      <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 0 0 1.06.053L16.5 4.44v2.81a.75.75 0 0 0 1.5 0v-4.5a.75.75 0 0 0-.75-.75h-4.5a.75.75 0 0 0 0 1.5h2.553l-9.056 8.194a.75.75 0 0 0-.053 1.06Z" clipRule="evenodd" />
                    </svg>
                  </a>
                </div>
              </div>

              {/* Document Upload Section */}
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Muat Naik Dokumen RP</h4>
                <DocumentUploader 
                  onAddDocuments={handleAddDocuments} 
                  onRemoveDocument={handleRemoveDocument} 
                  documents={documents} 
                />
              </div>

            </div>
            
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => setShowSettings(false)} 
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
              >
                Tutup & Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      <div className={`fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white px-5 py-2.5 rounded-full shadow-xl transition-all duration-300 z-[100] flex items-center gap-2 ${toast.show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-green-400">
          <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
        </svg>
        <span className="text-xs font-medium">{toast.message}</span>
      </div>

    </div>
  );
};

export default App;
