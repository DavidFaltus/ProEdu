import React, { useState, useEffect } from 'react';
import { Download, ArrowRight, FileText } from 'lucide-react';
import { Button } from './ui/button';

interface PDFViewerProps {
  url: string;
  title?: string;
  className?: string;
}

export const PDFViewer: React.FC<PDFViewerProps> = ({ url, title = 'PDF Dokument', className = 'w-full h-full border-none' }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isDataUri, setIsDataUri] = useState(false);

  useEffect(() => {
    if (!url) {
      setBlobUrl(null);
      return;
    }

    if (url.startsWith('data:')) {
      setIsDataUri(true);
      // Převedení na blob pro bezpečnější stažení
      try {
        const mimeString = url.split(',')[0].split(':')[1].split(';')[0];
        const byteString = atob(url.split(',')[1]);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: mimeString });
        setBlobUrl(URL.createObjectURL(blob));
      } catch (e) {
        console.error('Nelze převést data URI na blob', e);
        setBlobUrl(url); // Failsafe
      }
    } else {
      setIsDataUri(false);
      // Pro normální URL použijeme Google Viewer, který funguje i v iframe (neblokuje ho prohlížeč tak často jako nativní PDF)
      const viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
      setBlobUrl(viewerUrl);
    }

    return () => {
      // Clean up object URL if we created one
      if (blobUrl && blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [url]);

  if (!url) return null;

  return (
    <div className={`relative flex flex-col bg-gray-100 ${className}`}>
      {isDataUri ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white">
           <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center text-brand-blue mb-6">
             <FileText size={40} />
           </div>
           <h3 className="text-xl font-bold text-gray-800 mb-2">Tento dokument je uložen rovnou v databázi</h3>
           <p className="text-gray-500 max-w-sm mx-auto mb-8">Vyhýbáme se riziku zaseknutí okna s náhledem, protože tento soubor je kvůli chybějícímu úložišti uložen celistvě v samotné textové paměti databáze. Můžete si jej ale bezpečně stáhnout.</p>
           <a 
             href={blobUrl || url} 
             download={title || 'dokument.pdf'}
             className="btn-blue h-14 px-8 rounded-2xl font-bold flex items-center gap-3 transition-transform hover:scale-105"
           >
             <Download size={22} />
             Stáhnout dokument
           </a>
        </div>
      ) : (
        <div className="flex-1 relative">
          {blobUrl && (
            <iframe 
              src={blobUrl} 
              className="absolute inset-0 w-full h-full border-none" 
              title={title}
            />
          )}
        </div>
      )}
    </div>
  );
};

