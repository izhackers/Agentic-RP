import React, { useRef, useState } from 'react';
import { RPDocument } from '../types';

interface DocumentUploaderProps {
  onAddDocuments: (files: File[]) => void;
  onRemoveDocument: (id: string) => void;
  documents: RPDocument[];
}

const DocumentUploader: React.FC<DocumentUploaderProps> = ({ onAddDocuments, onRemoveDocument, documents }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const filesArray = Array.from(event.target.files);
      onAddDocuments(filesArray);
      // Reset input so same file can be selected again if needed
      event.target.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      onAddDocuments(filesArray);
    }
  };

  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-4 flex flex-col h-auto max-h-[50vh]">
      <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
        Dokumen RP Rujukan
      </h3>
      
      {/* Upload Area */}
      <div 
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors mb-4 flex-shrink-0 ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept=".txt,.md,.pdf" 
          multiple // Allow multiple files
          onChange={handleFileChange} 
        />
        <div className="flex flex-col items-center text-slate-500">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mb-2 text-slate-400">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <span className="text-xs font-medium">Klik atau Seret Fail (Jilid 1, 2, 3)</span>
          <span className="text-[10px] text-slate-400 mt-1">Sokongan: PDF & Teks (Berbilang Fail)</span>
        </div>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
        {documents.length > 0 ? (
          documents.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-sm group">
              <div className="flex items-center space-x-2 overflow-hidden">
                {doc.mimeType === 'application/pdf' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-red-500 flex-shrink-0">
                    <path fillRule="evenodd" d="M4 4a2 2 0 0 1 2-2h4.586A2 2 0 0 1 12 2.586L15.414 6A2 2 0 0 1 16 7.414V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Zm2 6a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 6 10Zm0 3a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 6 13Z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-500 flex-shrink-0">
                    <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Zm2.25 8.5a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 3a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z" clipRule="evenodd" />
                  </svg>
                )}
                <span className="truncate text-slate-700 font-medium" title={doc.name}>{doc.name}</span>
              </div>
              <button 
                onClick={() => onRemoveDocument(doc.id)}
                className="text-slate-400 hover:text-red-600 transition-colors flex-shrink-0 ml-2"
                title="Alih keluar"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>
          ))
        ) : (
          <div className="text-center py-4">
             <span className="text-xs text-slate-400 italic">Tiada dokumen aktif</span>
          </div>
        )}
      </div>

      <div className="mt-3 bg-blue-50 p-2 rounded text-xs text-blue-800 flex-shrink-0">
        <p><strong>Info AI:</strong> Anda boleh muat naik <strong>Jilid 1, 2 & 3</strong> serentak. AI akan merujuk kesemuanya.</p>
      </div>
    </div>
  );
};

export default DocumentUploader;