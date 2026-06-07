/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  FileText, 
  Languages, 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  Search,
  BookOpen,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  AlertTriangle,
  Library as LibraryIcon,
  Trash2,
  Save,
  Clock,
  Type
} from 'lucide-react';
import { extractTextFromPdf, PageContent, extractOutlineFromPdf, generateFallbackOutline } from './services/pdfService.ts';
import { translateText } from './services/geminiService.ts';
import { saveBook, getAllBooks, deleteBook, SavedBook, clearAllBooks, BookmarkItem } from './services/storageService.ts';
import { exportToPdf } from './services/exportService.ts';
import { exportToEpub, exportToTxt } from './services/epubService.ts';

type AppState = 'upload' | 'translating' | 'reader' | 'library';

interface TranslatedPage extends PageContent {
  translatedText?: string;
  isTranslating: boolean;
  isEditing?: boolean;
  error?: string;
}

export default function App() {
  const [state, setState] = useState<AppState>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<TranslatedPage[]>([]);
  const pagesRef = useRef<TranslatedPage[]>(pages);
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);
  const [targetLang, setTargetLang] = useState('Tiếng Việt');
  const [currentPage, setCurrentPage] = useState(0);
  const [isAutoTranslating, setIsAutoTranslating] = useState(true);
  const [savedBooks, setSavedBooks] = useState<SavedBook[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTranslations, setActiveTranslations] = useState(0);
  const [currentBookId, setCurrentBookId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'split' | 'text'>('split');
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [editingText, setEditingText] = useState("");
  const [notification, setNotification] = useState<{message: string, type: 'error' | 'success' | 'info', index?: number} | null>(null);
  const [workerTrigger, setWorkerTrigger] = useState(0);
  const [bookOutline, setBookOutline] = useState<BookmarkItem[]>([]);
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);

  const translatedCount = pages.filter(p => p.translatedText && p.translatedText !== "Dịch thuật thất bại." && p.translatedText.trim() !== "").length;
  const overallProgress = pages.length > 0 ? (translatedCount / pages.length) * 100 : 0;

  const translateQueueRef = useRef<number[]>([]);
  const isCurrentlyTranslatingRef = useRef(0); // Changed to counter for concurrency

  const triggerNotification = (message: string, type: 'error' | 'success' | 'info' = 'error', index?: number) => {
    setNotification({ message, type, index });
  };

  // Load saved books
  useEffect(() => {
    if (state !== 'library') return;
    const loadBooksFromStorage = async () => {
      try {
        const books = await getAllBooks();
        setSavedBooks(books.sort((a, b) => b.timestamp - a.timestamp));
      } catch (err) {
        console.error("Failed to load library", err);
      }
    };
    loadBooksFromStorage();
  }, [state]);

  // Load PDF and extract text
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setCurrentBookId(null); // New file, not a saved book yet
      setFile(selectedFile);
      setState('translating');
      try {
        const extractedPages = await extractTextFromPdf(selectedFile);
        setPages(extractedPages.map(p => ({ ...p, isTranslating: false })));
        
        // Extract standard outline or fallback automatically to chapter detection
        let outline = await extractOutlineFromPdf(selectedFile);
        if (!outline || outline.length === 0) {
          outline = generateFallbackOutline(extractedPages);
        }
        setBookOutline(outline);

        setState('reader');
        setCurrentPage(0);
      } catch (err) {
        console.error("PDF Extraction failed", err);
        triggerNotification("Không thể đọc file PDF. Vui lòng thử lại với file khác.", 'error');
        setState('upload');
      }
    }
  };

  const [isExporting, setIsExporting] = useState<string | null>(null);

  const handleExport = async (format: 'pdf' | 'epub' | 'txt', bookToExport?: SavedBook) => {
    const title = bookToExport ? bookToExport.name : (file?.name || "translated_book");
    const pagesToExport = bookToExport ? bookToExport.pages : pages;
    const outlineToExport = bookToExport ? (bookToExport.outline || []) : bookOutline;
    
    setIsExporting(format);
    try {
      if (format === 'pdf') await exportToPdf(title, pagesToExport, outlineToExport);
      else if (format === 'epub') await exportToEpub(title, pagesToExport, outlineToExport);
      else if (format === 'txt') await exportToTxt(title, pagesToExport);
      triggerNotification(`Đã xuất file ${format.toUpperCase()} thành công!`, 'success');
    } catch (err) {
      console.error("Export failed", err);
      triggerNotification(`Xuất file ${format.toUpperCase()} thất bại.`, 'error');
    } finally {
      setIsExporting(null);
    }
  };

  const handleSaveToLibrary = async () => {
    if (!file || pages.length === 0) return;
    setIsSaving(true);
    try {
      const bookToSave: SavedBook = {
        id: `${file.name}-${Date.now()}`,
        name: file.name,
        pages: pages,
        targetLang: targetLang,
        timestamp: Date.now(),
        outline: bookOutline
      };
      await saveBook(bookToSave);
      // Refresh list
      const books = await getAllBooks();
      setSavedBooks(books.sort((a, b) => b.timestamp - a.timestamp));
      triggerNotification("Đã lưu vào thư viện thành công!", 'success');
    } catch (err) {
      console.error("Save failed", err);
      triggerNotification("Không thể lưu sách. Có thể do giới hạn bộ nhớ.", 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const loadSavedBook = (book: SavedBook) => {
    setCurrentBookId(book.id);
    setPages(book.pages);
    setTargetLang(book.targetLang);
    setBookOutline(book.outline || []);
    setFile({ name: book.name } as File); // Partial mock file
    setState('reader');
    setViewMode('split');
    setCurrentPage(0);
    triggerNotification(`Đã mở: ${book.name}`, 'info');
  };

  const handleDeleteBook = (id: string | null, e: React.MouseEvent) => {
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    console.log("Setting delete confirm for book:", id);
    setDeleteConfirmId(id);
  };

  const confirmDeleteBook = async () => {
    if (!deleteConfirmId) return;
    const id = deleteConfirmId;
    setDeleteConfirmId(null);
    try {
      await deleteBook(id);
      console.log("Book deleted from storage successfully in background:", id);
      
      const books = await getAllBooks();
      setSavedBooks(books.sort((a, b) => b.timestamp - a.timestamp));
      
      if (currentBookId === id) {
        setCurrentBookId(null);
        setPages([]);
        setFile(null);
        setState('library');
      }
      triggerNotification("Đã xóa sách khỏi thư viện", 'info');
    } catch (err) {
      console.error("Delete failed", err);
      triggerNotification("Không thể xóa sách. Vui lòng thử lại.", 'error');
    }
  };

  const handleClearLibrary = () => {
    setShowClearConfirm(true);
  };

  const confirmClearLibrary = async () => {
    setShowClearConfirm(false);
    try {
      await clearAllBooks();
      localStorage.clear(); 
      setSavedBooks([]);
      setPages([]);
      setFile(null);
      setCurrentBookId(null);
      setState('upload');
      triggerNotification("Đã đặt lại toàn bộ ứng dụng thành công!", 'success');
      
      // Force page reload to safely clear active worker hooks and release blocked IndexedDB handles
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (err) {
      console.error("Clear storage failed", err);
      triggerNotification("Có lỗi xảy ra khi xóa dữ liệu.", 'error');
    }
  };

  const retryAllErrors = () => {
    const errorIndices = pages
      .map((p, i) => (p.error || p.translatedText === "Dịch thuật thất bại.") ? i : -1)
      .filter(i => i !== -1);
    
    if (errorIndices.length === 0) {
      triggerNotification("Không có trang nào bị lỗi dịch.", 'info');
      return;
    }

    setPages(prev => prev.map((p, i) => errorIndices.includes(i) ? { ...p, translatedText: undefined, error: undefined, isTranslating: true } : p));
    translateQueueRef.current = [...new Set([...translateQueueRef.current, ...errorIndices])];
    setWorkerTrigger(prev => prev + 1);
  };

  const regeneratePage = (index: number) => {
    setPages(prev => prev.map((p, i) => i === index ? { ...p, translatedText: undefined, error: undefined, isTranslating: true } : p));
    translateQueueRef.current.push(index);
    setWorkerTrigger(prev => prev + 1);
  };

  const startEditing = (index: number) => {
    setEditingText(pages[index].translatedText || "");
    setPages(prev => prev.map((p, i) => i === index ? { ...p, isEditing: true } : p));
  };

  const saveEdit = (index: number) => {
    setPages(prev => prev.map((p, i) => i === index ? { ...p, translatedText: editingText, isEditing: false } : p));
    triggerNotification("Đã cập nhật bản dịch", 'success');
  };

  const cancelEdit = (index: number) => {
    setPages(prev => prev.map((p, i) => i === index ? { ...p, isEditing: false } : p));
  };

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Re-prioritize page translation queue when viewport/pages change
  useEffect(() => {
    if (state !== 'reader' || !isAutoTranslating) return;

    // Find pages needing translation using latest pages value
    const untranslatedIndices = pages
      .map((p, i) => {
        const hasValidTranslation = p.translatedText && 
                                    p.translatedText !== "Dịch thuật thất bại." && 
                                    p.translatedText.trim() !== "";
        return (!hasValidTranslation && !p.isTranslating && !p.error) ? i : -1;
      })
      .filter(i => i !== -1);
    
    if (untranslatedIndices.length > 0) {
      // Prioritize pages surrounding the user's current page (viewport)
      const sortedIndices = [...untranslatedIndices].sort((a, b) => {
        const distA = Math.abs(a - currentPage);
        const distB = Math.abs(b - currentPage);
        return distA - distB;
      });

      translateQueueRef.current = sortedIndices;
    } else {
      translateQueueRef.current = [];
    }
  }, [state, pages, currentPage, isAutoTranslating]);

  // Background translation worker loop
  useEffect(() => {
    if (state !== 'reader' || !isAutoTranslating) {
      setActiveTranslations(0);
      isCurrentlyTranslatingRef.current = 0;
      return;
    }

    let active = true;

    const runWorker = async () => {
      while (active) {
        // Safe concurrency limit
        if (isCurrentlyTranslatingRef.current >= 2 || translateQueueRef.current.length === 0) {
          // Worker stays alive but sleeps/yields for 800ms if idle or waiting
          await new Promise(resolve => setTimeout(resolve, 800));
          continue;
        }

        const pageIndex = translateQueueRef.current.find(idx => {
          const p = pagesRef.current[idx];
          const hasValidTranslation = p && 
                                      p.translatedText && 
                                      p.translatedText !== "Dịch thuật thất bại." && 
                                      p.translatedText.trim() !== "";
          return p && !hasValidTranslation && !p.isTranslating && !p.error;
        });

        if (pageIndex === undefined) {
          await new Promise(resolve => setTimeout(resolve, 800));
          continue;
        }

        // Remove pageIndex from the queue so other workers don't pick it up
        translateQueueRef.current = translateQueueRef.current.filter(idx => idx !== pageIndex);

        // Fetch up-to-date page state from pagesRef to avoid stale closure of pages list
        const latestPage = pagesRef.current[pageIndex];
        if (!latestPage) {
          continue;
        }

        isCurrentlyTranslatingRef.current += 1;
        setActiveTranslations(prev => prev + 1);

        setPages(prev => prev.map((p, idx) => idx === pageIndex ? { ...p, isTranslating: true } : p));

        const textToTranslate = latestPage.text;
        if (textToTranslate) {
          try {
            const result = await translateText(textToTranslate, targetLang);
            if (!active) {
              isCurrentlyTranslatingRef.current = Math.max(0, isCurrentlyTranslatingRef.current - 1);
              setActiveTranslations(prev => Math.max(0, prev - 1));
              return;
            }

            setPages(prev => prev.map((p, idx) => idx === pageIndex ? { 
              ...p, 
              translatedText: result, 
              isTranslating: false,
              error: undefined
            } : p));
          } catch (err: any) {
            if (!active) {
              isCurrentlyTranslatingRef.current = Math.max(0, isCurrentlyTranslatingRef.current - 1);
              setActiveTranslations(prev => Math.max(0, prev - 1));
              return;
            }

            const isQuotaExceeded = err?.message?.includes("429") || 
                                    err?.message?.includes("RESOURCE_EXHAUSTED") ||
                                    err?.message?.includes("Quota exceeded") ||
                                    err?.status === "RESOURCE_EXHAUSTED";

            setPages(prev => prev.map((p, idx) => idx === pageIndex ? { 
              ...p, 
              error: isQuotaExceeded ? "Hết hạn mức API" : "Lỗi dịch thuật", 
              isTranslating: false,
              translatedText: undefined
            } : p));

            if (isQuotaExceeded) {
              triggerNotification("Hết hạn mức API (Quota exceeded). Vui lòng đợi một lát hoặc thử lại sau.", 'error');
              setIsAutoTranslating(false); // Stop auto-translation to prevent further errors
              isCurrentlyTranslatingRef.current = Math.max(0, isCurrentlyTranslatingRef.current - 1);
              setActiveTranslations(prev => Math.max(0, prev - 1));
              break; // Break active worker loop
            } else {
              triggerNotification(`Gặp lỗi khi dịch trang ${pageIndex + 1}.`, 'error', pageIndex);
            }
          }
        } else {
          if (active) {
            setPages(prev => prev.map((p, idx) => idx === pageIndex ? { 
              ...p, 
              translatedText: "(Trang trống)", 
              isTranslating: false 
            } : p));
          }
        }

        isCurrentlyTranslatingRef.current = Math.max(0, isCurrentlyTranslatingRef.current - 1);
        setActiveTranslations(prev => Math.max(0, prev - 1));

        // Polite pause between pages on each thread
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    };

    // Reset tracking count for fresh worker instance
    isCurrentlyTranslatingRef.current = 0;
    setActiveTranslations(0);

    // Run 2 parallel workspace workers
    runWorker();
    setTimeout(() => {
      if (active) runWorker();
    }, 200);

    return () => {
      active = false;
    };
  }, [state, isAutoTranslating, targetLang, workerTrigger]);

  const goToNextPage = () => {
    if (currentPage < pages.length - 1) setCurrentPage(prev => prev + 1);
  };

  const goToPrevPage = () => {
    if (currentPage > 0) setCurrentPage(prev => prev - 1);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-paper)] text-[var(--color-ink)] selection:bg-accent/20">
      {/* Header */}
      <header className="h-16 border-b border-black/5 flex items-center justify-between px-6 bg-white/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[var(--color-accent)] rounded-lg flex items-center justify-center text-white">
            <BookOpen size={18} />
          </div>
          <h1 className="font-serif font-bold text-xl tracking-tight">Trình Dịch Sách AI</h1>
        </div>
        
          {state === 'reader' && (
            <div className="flex items-center gap-6">
              <button 
                onClick={() => setIsAutoTranslating(!isAutoTranslating)}
                className={`flex items-center gap-2 text-xs uppercase font-bold tracking-widest transition-all ${isAutoTranslating ? 'text-green-600' : 'text-gray-400 hover:text-green-600'}`}
              >
                {activeTranslations > 0 ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Languages size={14} />
                )}
                <span>{isAutoTranslating ? (activeTranslations > 0 ? "Đang dịch sách..." : "Tự động dịch đang bật") : "Dịch toàn bộ"}</span>
              </button>
              
              <div className="flex items-center gap-2 border-l border-black/5 pl-6">
                <span className="text-[10px] uppercase font-bold tracking-widest opacity-30">Công cụ:</span>
                <button 
                  onClick={retryAllErrors}
                  className="flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:opacity-70 transition-opacity"
                  title="Dịch lại tất cả các trang bị lỗi"
                >
                  <AlertCircle size={12} />
                  <span>Sửa lỗi dịch</span>
                </button>
                <div className="w-px h-3 bg-black/10 mx-1" />
                <span className="text-[10px] uppercase font-bold tracking-widest opacity-30">Tải về:</span>
                <button 
                  onClick={() => handleExport('pdf')}
                  disabled={!!isExporting}
                  className="flex items-center gap-1.5 text-xs font-bold text-[var(--color-accent)] hover:opacity-70 transition-opacity disabled:opacity-20"
                >
                  {isExporting === 'pdf' ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                  <span>PDF</span>
                </button>
                <button 
                  onClick={() => handleExport('epub')}
                  disabled={!!isExporting}
                  className="flex items-center gap-1.5 text-xs font-bold text-[var(--color-accent)] hover:opacity-70 transition-opacity disabled:opacity-20"
                >
                  {isExporting === 'epub' ? <Loader2 size={12} className="animate-spin" /> : <BookOpen size={12} />}
                  <span>EPUB</span>
                </button>
                <button 
                  onClick={() => handleExport('txt')}
                  disabled={!!isExporting}
                  className="flex items-center gap-1.5 text-xs font-bold text-[var(--color-accent)] hover:opacity-70 transition-opacity disabled:opacity-20"
                >
                  {isExporting === 'txt' ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                  <span>TXT</span>
                </button>
              </div>

              <button 
                onClick={handleSaveToLibrary}
                disabled={isSaving}
                className="flex items-center gap-2 text-xs uppercase font-bold tracking-widest text-[var(--color-accent)] hover:opacity-70 transition-opacity disabled:opacity-20"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                <span>{isSaving ? "Đang lưu..." : "Lưu vào thư viện"}</span>
              </button>

              {currentBookId && (
                <button 
                  onClick={(e) => handleDeleteBook(currentBookId, e as any)}
                  className="flex items-center gap-2 text-xs uppercase font-bold tracking-widest text-red-500/60 hover:text-red-500 transition-all hover:scale-105"
                  title="Xóa sách khỏi thư viện"
                >
                  <Trash2 size={14} />
                  <span>Xóa</span>
                </button>
              )}
              <div className="hidden md:flex items-center gap-2 text-sm font-medium opacity-60">
                <Languages size={14} />
                <span>Dịch sang: {targetLang}</span>
              </div>

              <div className="hidden lg:flex flex-col items-end gap-1 min-w-[140px]">
                <div className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest whitespace-nowrap">
                   <span className="opacity-40">Đã dịch:</span>
                   <span className="text-[var(--color-accent)]">{translatedCount} / {pages.length} trang</span>
                </div>
                <div className="w-full h-1.5 bg-black/5 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-[var(--color-accent)]" 
                    initial={{ width: 0 }}
                    animate={{ width: `${overallProgress}%` }}
                    transition={{ type: 'spring', damping: 25, stiffness: 120 }}
                  />
                </div>
              </div>
            </div>
          )}

        <div className="flex items-center gap-3">
          {state !== 'library' && (
             <button 
              onClick={() => setState('library')}
              className="flex items-center gap-2 text-xs uppercase font-bold tracking-widest opacity-40 hover:opacity-100 transition-opacity"
            >
              <LibraryIcon size={14} />
              <span>Thư viện</span>
            </button>
          )}
          {state === 'reader' && (
            <button 
              onClick={() => setState('upload')}
              className="text-xs uppercase font-bold tracking-widest opacity-40 hover:opacity-100 transition-opacity"
            >
              Tải file khác
            </button>
          )}
          <a href="https://ai.studio/build" className="text-xs uppercase font-bold tracking-widest opacity-40 hover:opacity-100 transition-opacity">
            AIS Build
          </a>
          <div className="h-4 w-px bg-black/10 mx-1" />
          <button 
            onClick={handleClearLibrary}
            className="text-xs uppercase font-bold tracking-widest text-red-500/40 hover:text-red-500 transition-colors"
            title="Xóa toàn bộ dữ liệu ứng dụng"
          >
            Xóa bộ nhớ
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        <AnimatePresence mode="wait">
          {state === 'upload' && (
            <motion.div 
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex-1 flex flex-col items-center justify-center p-6 max-w-2xl mx-auto w-full"
            >
              <div className="text-center mb-12">
                <h2 className="font-serif text-5xl font-semibold mb-4 leading-tight">
                  Mang trí tuệ AI vào từng trang sách của bạn.
                </h2>
                <p className="text-lg opacity-60">
                  Tải lên tài liệu PDF và trải nghiệm trình dịch thuật thông minh nhất.
                </p>
              </div>

              <label className="w-full aspect-video border-2 border-dashed border-black/10 rounded-3xl flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-[var(--color-accent)] hover:bg-[var(--color-accent)]/5 transition-all group relative overflow-hidden">
                <input 
                  type="file" 
                  accept=".pdf" 
                  onChange={handleFileUpload} 
                  className="hidden" 
                />
                <div className="w-16 h-16 bg-[var(--color-accent)]/10 rounded-full flex items-center justify-center text-[var(--color-accent)] group-hover:scale-110 transition-transform">
                  <Upload size={28} />
                </div>
                <div className="text-center">
                  <p className="font-medium text-lg">Kéo thả hoặc nhấp để tải PDF</p>
                  <p className="text-sm opacity-50 mt-1">Hỗ trợ file tối đa 20MB</p>
                </div>
              </label>

              <div className="mt-12 w-full grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { icon: <Languages size={20} />, title: "Đa ngôn ngữ", desc: "Dịch từ bất kỳ ngôn ngữ nào sang Tiếng Việt và ngược lại." },
                  { icon: <FileText size={20} />, title: "Giữ định dạng", desc: "Tập trung vào nội dung và ngữ cảnh của từng trang sách." },
                  { icon: <AlertCircle size={20} />, title: "Bảo mật", desc: "File của bạn được xử lý an toàn và không lưu trữ lâu dài." }
                ].map((item, i) => (
                  <div key={i} className="p-4 bg-white/30 rounded-2xl border border-black/5">
                    <div className="mb-3 text-[var(--color-accent)]">{item.icon}</div>
                    <h4 className="font-bold text-sm mb-1">{item.title}</h4>
                    <p className="text-xs opacity-60">{item.desc}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {state === 'library' && (
            <motion.div 
              key="library"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="flex-1 p-8 md:p-12 max-w-6xl mx-auto w-full"
            >
              <div className="flex items-center justify-between mb-12">
                <div>
                  <h2 className="font-serif text-4xl font-semibold mb-2">Thư viện của bạn</h2>
                  <p className="opacity-50">Nơi lưu trữ những cuốn sách bạn đã dịch.</p>
                </div>
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <div className="flex flex-col items-end mr-4">
                    <span className="text-[10px] uppercase font-bold tracking-widest opacity-40">Dung lượng</span>
                    <span className="text-xs font-bold text-red-500 hover:opacity-100 transition-opacity cursor-pointer" onClick={handleClearLibrary}>
                      Xóa toàn bộ bộ nhớ
                    </span>
                  </div>
                  <button 
                    onClick={() => setState('upload')}
                    className="bg-[var(--color-accent)] text-white px-6 py-3 rounded-full font-bold text-sm tracking-widest uppercase flex items-center gap-2 hover:scale-105 transition-transform"
                  >
                    <Upload size={18} />
                    <span>Dịch sách mới</span>
                  </button>
                </div>
              </div>

              {savedBooks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-black/5 rounded-3xl opacity-30">
                  <LibraryIcon size={48} className="mb-4" />
                  <p className="font-medium">Chưa có sách nào trong thư viện.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <AnimatePresence mode="popLayout">
                    {savedBooks.map((book) => {
                      const translatedCount = book.pages.filter(p => p.translatedText && p.translatedText !== "Dịch thuật thất bại." && p.translatedText.trim() !== "").length;
                      const bookProgress = Math.round((translatedCount / book.pages.length) * 100);
                      
                      return (
                        <motion.div 
                          key={book.id}
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.93, y: 10 }}
                          transition={{ duration: 0.25, ease: "easeInOut" }}
                          onClick={() => loadSavedBook(book)}
                          className="p-6 bg-white border border-black/5 rounded-2xl book-shadow cursor-pointer hover:border-[var(--color-accent)]/30 group transition-colors duration-200"
                        >
                        <div className="flex items-start justify-between mb-4">
                          <div className="w-10 h-10 bg-black/5 rounded-lg flex items-center justify-center text-black/40 group-hover:bg-[var(--color-accent)]/10 group-hover:text-[var(--color-accent)] transition-colors">
                            <FileText size={20} />
                          </div>
                          <div className="flex items-center gap-2">
                             {bookProgress < 100 && (
                               <button 
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  loadSavedBook(book); 
                                  setIsAutoTranslating(true); 
                                }}
                                title="Dịch tiếp phần còn lại"
                                className="p-2 text-green-600/30 hover:text-green-600 hover:bg-green-50 transition-all rounded-lg"
                              >
                                <Languages size={16} />
                              </button>
                             )}
                             <div className="relative group/export">
                               <button 
                                className="p-2 text-[var(--color-accent)]/30 hover:text-[var(--color-accent)] hover:bg-[var(--color-accent)]/5 transition-all rounded-lg"
                               >
                                <Download size={16} />
                               </button>
                               <div className="absolute bottom-full right-0 mb-2 hidden group-hover/export:flex flex-col bg-white border border-black/5 shadow-xl rounded-xl py-1 z-50 min-w-[100px]">
                                 <button onClick={() => handleExport('pdf', book)} className="px-4 py-2 text-xs font-bold text-left hover:bg-black/5 flex items-center gap-2">PDF</button>
                                 <button onClick={() => handleExport('epub', book)} className="px-4 py-2 text-xs font-bold text-left hover:bg-black/5 flex items-center gap-2">EPUB</button>
                                 <button onClick={() => handleExport('txt', book)} className="px-4 py-2 text-xs font-bold text-left hover:bg-black/5 flex items-center gap-2">TXT</button>
                               </div>
                             </div>
                             <button 
                              onClick={(e) => handleDeleteBook(book.id, e)}
                              className="relative z-10 flex items-center gap-1.5 p-2 px-3 text-red-500/50 hover:text-red-500 hover:bg-red-50 transition-all rounded-xl active:scale-95"
                              title="Xóa sách khỏi thư viện"
                            >
                              <Trash2 size={16} />
                              <span className="text-[10px] uppercase font-bold tracking-widest">Xóa</span>
                            </button>
                          </div>
                        </div>
                        <h3 className="font-bold text-lg mb-1 truncate">{book.name}</h3>
                        <p className="text-xs opacity-40 flex items-center gap-1 mb-4">
                          <Clock size={12} />
                          {new Date(book.timestamp).toLocaleDateString('vi-VN')}
                        </p>
                        <div className="mt-auto pt-4 border-t border-black/5">
                          <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-widest mb-2">
                            <span className="opacity-40">Tiến độ dịch</span>
                            <span className="text-[var(--color-accent)]">{bookProgress}%</span>
                          </div>
                          <div className="h-1 w-full bg-black/5 rounded-full overflow-hidden">
                            <div className="h-full bg-[var(--color-accent)] transition-all" style={{ width: `${bookProgress}%` }} />
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          )}

          {state === 'translating' && (
            <motion.div 
              key="translating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center gap-6"
            >
              <Loader2 className="animate-spin text-[var(--color-accent)]" size={48} />
              <div className="text-center">
                <h3 className="text-xl font-bold">Đang chuẩn bị nội dung...</h3>
                <p className="opacity-50 mt-2">Đang phân tích định dạng PDF của bạn.</p>
              </div>
            </motion.div>
          )}

          {state === 'reader' && (
            <motion.div 
              key="reader"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex flex-col"
            >
              {/* Toolbar */}
              <div className="h-12 border-b border-black/5 bg-white/30 backdrop-blur-sm flex items-center justify-between px-6">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1 text-sm font-medium">
                    <span className="opacity-40">Trang</span>
                    <input 
                      type="number"
                      min={1}
                      max={pages.length}
                      value={currentPage + 1}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "") return;
                        const p = parseInt(val);
                        if (!isNaN(p) && p >= 1 && p <= pages.length) {
                          setCurrentPage(p - 1);
                        }
                      }}
                      className="w-10 text-center bg-black/5 hover:bg-black/10 rounded px-1 transition-colors focus:bg-white focus:ring-1 focus:ring-[var(--color-accent)] focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="opacity-40">/ {pages.length}</span>
                  </div>
                  <div className="h-4 w-px bg-black/10 mx-2" />
                  <button
                    onClick={() => setViewMode(viewMode === 'split' ? 'text' : 'split')}
                    className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider transition-colors ${viewMode === 'text' ? 'text-[var(--color-accent)]' : 'opacity-40 hover:opacity-100'}`}
                    title={viewMode === 'split' ? "Xem chế độ văn bản" : "Xem chế độ song ngữ"}
                  >
                    <Type size={14} />
                    <span className="hidden sm:inline">{viewMode === 'split' ? 'Chế độ đọc' : 'Chế độ mặc định'}</span>
                  </button>

                  <div className="relative">
                    <button
                      onClick={() => setIsOutlineOpen(!isOutlineOpen)}
                      className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider transition-colors ${isOutlineOpen ? 'text-[var(--color-accent)]' : 'opacity-40 hover:opacity-100'}`}
                      title="Mục lục sách"
                    >
                      <BookOpen size={14} />
                      <span className="hidden sm:inline">Mục lục</span>
                    </button>
                    
                    {isOutlineOpen && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="absolute top-full left-0 mt-2 w-72 bg-white border border-black/10 shadow-2xl rounded-2xl p-4 z-[100]"
                      >
                        <h4 className="text-xs font-bold uppercase tracking-wider mb-3 opacity-60">Mục lục sách</h4>
                        <div className="max-h-64 overflow-y-auto space-y-1 pr-1 outline-none">
                          {bookOutline.length > 0 ? (
                            (() => {
                              const renderOutlineItems = (items: BookmarkItem[], depth = 0) => {
                                return items.map((item, idx) => (
                                  <div key={`${depth}-${idx}`} className="space-y-1">
                                    <button
                                      onClick={() => {
                                        const targetIdx = Math.min(Math.max(1, item.pageNumber), pages.length) - 1;
                                        setCurrentPage(targetIdx);
                                        setIsOutlineOpen(false);
                                      }}
                                      style={{ paddingLeft: `${depth * 12 + 8}px` }}
                                      className="w-full text-left py-1.5 px-2 hover:bg-black/5 rounded-lg text-xs font-medium transition-colors flex items-center justify-between group"
                                    >
                                      <span className="truncate group-hover:text-[var(--color-accent)] transition-colors">{item.title}</span>
                                      <span className="text-[10px] opacity-40 ml-2 shrink-0">Trang {item.pageNumber}</span>
                                    </button>
                                    {item.items && item.items.length > 0 && renderOutlineItems(item.items, depth + 1)}
                                  </div>
                                ));
                              };
                              return renderOutlineItems(bookOutline);
                            })()
                          ) : (
                            <p className="text-center py-6 text-xs opacity-40 italic">Không tìm thấy mục lục</p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </div>
                  
                  <div className="relative">
                    <button
                      onClick={() => setIsSearchOpen(!isSearchOpen)}
                      className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider transition-colors ${isSearchOpen ? 'text-[var(--color-accent)]' : 'opacity-40 hover:opacity-100'}`}
                      title="Tìm kiếm trong sách"
                    >
                      <Search size={14} />
                      <span className="hidden sm:inline">Tìm nội dung</span>
                    </button>
                    
                    {isSearchOpen && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="absolute top-full left-0 mt-2 w-72 bg-white border border-black/10 shadow-2xl rounded-2xl p-4 z-[100]"
                      >
                        <div className="relative mb-4">
                          <input 
                            autoFocus
                            type="text"
                            placeholder="Tìm từ khóa..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-black/5 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                          />
                          <Search className="absolute left-3 top-2.5 opacity-20" size={16} />
                        </div>
                        
                        <div className="max-h-60 overflow-y-auto space-y-2">
                          {searchQuery.length > 2 ? (
                            (() => {
                              const results = pages.map((p, i) => {
                                const transMatch = p.translatedText?.toLowerCase().includes(searchQuery.toLowerCase());
                                const origMatch = p.text.toLowerCase().includes(searchQuery.toLowerCase());
                                
                                if (transMatch || origMatch) {
                                  const fullText = transMatch ? p.translatedText! : p.text;
                                  const index = fullText.toLowerCase().indexOf(searchQuery.toLowerCase());
                                  const start = Math.max(0, index - 20);
                                  const snippet = fullText.substring(start, index + 60);

                                  return (
                                    <button
                                      key={i}
                                      onClick={() => {
                                        setCurrentPage(i);
                                        setIsSearchOpen(false);
                                      }}
                                      className="w-full text-left p-3 hover:bg-black/5 rounded-xl transition-colors group border border-transparent hover:border-black/5"
                                    >
                                      <div className="flex justify-between items-center mb-1">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-accent)]">Trang {i + 1}</span>
                                        <ChevronRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                      </div>
                                      <p className="text-xs opacity-60 line-clamp-2 italic leading-relaxed">
                                        ...{snippet}...
                                      </p>
                                    </button>
                                  );
                                }
                                return null;
                              }).filter(Boolean);

                              return results.length > 0 ? results : (
                                <p className="text-center py-8 text-xs opacity-40">Không tìm thấy kết quả</p>
                              );
                            })()
                          ) : (
                            <p className="text-center py-8 text-xs opacity-40">Nhập ít nhất 3 ký tự để tìm</p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </div>
                  <select 
                    value={targetLang} 
                    onChange={(e) => setTargetLang(e.target.value)}
                    className="text-xs font-bold uppercase tracking-wider bg-transparent cursor-pointer focus:outline-none"
                  >
                    <option value="Tiếng Việt">Tiếng Việt</option>
                    <option value="Tiếng Anh">Tiếng Anh</option>
                    <option value="Tiếng Nhật">Tiếng Nhật</option>
                    <option value="Tiếng Trung">Tiếng Trung</option>
                    <option value="Tiếng Hàn">Tiếng Hàn</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button 
                    onClick={goToPrevPage}
                    disabled={currentPage === 0}
                    className="p-1.5 hover:bg-black/5 rounded-lg disabled:opacity-20 transition-colors"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button 
                    onClick={goToNextPage}
                    disabled={currentPage === pages.length - 1}
                    className="p-1.5 hover:bg-black/5 rounded-lg disabled:opacity-20 transition-colors"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>

              {/* Viewer Area */}
              {viewMode === 'split' ? (
                <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-2">
                  {/* Original View */}
                  <div className="p-8 md:p-12 overflow-y-auto border-r border-black/5 relative group">
                    <div className="absolute top-4 left-6 text-[10px] uppercase font-bold tracking-[0.2em] opacity-40">Bản Gốc</div>
                    <div className="max-w-prose mx-auto">
                      <motion.div
                        key={`orig-${currentPage}`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="font-serif text-lg leading-relaxed whitespace-pre-wrap"
                      >
                        {pages[currentPage].text || <div className="italic opacity-30">Trang này không có văn bản hoặc là hình ảnh.</div>}
                      </motion.div>
                    </div>
                  </div>

                  {/* Translated View */}
                  <div className="p-8 md:p-12 overflow-y-auto bg-white/40 relative">
                    <div className="absolute top-4 left-6 flex items-center gap-4">
                      <div className="text-[10px] uppercase font-bold tracking-[0.2em] text-[var(--color-accent)]">Bản Dịch</div>
                      {!pages[currentPage].isTranslating && pages[currentPage].translatedText && !pages[currentPage].isEditing && (
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => startEditing(currentPage)}
                            className="p-1 hover:bg-black/5 rounded text-[10px] font-bold uppercase text-gray-400 hover:text-[var(--color-accent)] transition-colors"
                          >
                            Sửa
                          </button>
                          <button 
                            onClick={() => regeneratePage(currentPage)}
                            className="p-1 hover:bg-black/5 rounded text-[10px] font-bold uppercase text-gray-400 hover:text-[var(--color-accent)] transition-colors"
                          >
                            Dịch lại
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="max-w-prose mx-auto group">
                      <AnimatePresence mode="wait">
                        {pages[currentPage].isEditing ? (
                          <motion.div
                            key="editing"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex flex-col gap-4"
                          >
                            <textarea
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              className="w-full h-[60vh] p-4 font-serif text-xl leading-relaxed bg-white/80 border border-[var(--color-accent)]/20 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/10"
                              placeholder="Nhập nội dung dịch..."
                            />
                            <div className="flex items-center gap-2 justify-end">
                              <button 
                                onClick={() => cancelEdit(currentPage)}
                                className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-gray-400 hover:text-gray-600 transition-colors"
                              >
                                Hủy
                              </button>
                              <button 
                                onClick={() => saveEdit(currentPage)}
                                className="px-6 py-2 bg-[var(--color-accent)] text-white text-xs font-bold uppercase tracking-widest rounded-full hover:scale-105 transition-transform"
                              >
                                Lưu thay đổi
                              </button>
                            </div>
                          </motion.div>
                        ) : pages[currentPage].isTranslating ? (
                          <motion.div 
                            key="loading"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-col items-center justify-center py-20 gap-4 opacity-40"
                          >
                            <Loader2 className="animate-spin" size={32} />
                            <p className="text-sm font-medium">Đang dịch trang này...</p>
                          </motion.div>
                        ) : (pages[currentPage].translatedText && pages[currentPage].translatedText !== "Dịch thuật thất bại.") ? (
                          <motion.div
                            key={`trans-${currentPage}`}
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="font-serif text-xl leading-relaxed text-[var(--color-accent)] whitespace-pre-wrap"
                          >
                            {pages[currentPage].translatedText}
                          </motion.div>
                        ) : pages[currentPage].error ? (
                          <motion.div 
                            key="error"
                            className="flex flex-col items-center justify-center py-20 gap-4 text-red-500/60"
                          >
                            <XCircle size={32} />
                            <p className="text-sm font-medium">{pages[currentPage].error}</p>
                            <button 
                              onClick={() => regeneratePage(currentPage)}
                              className="text-xs uppercase font-bold tracking-widest border border-red-500/20 px-4 py-2 rounded-full hover:bg-red-500/5 transition-colors"
                            >
                              Thử lại
                            </button>
                          </motion.div>
                        ) : (
                          <motion.div 
                            key="waiting"
                            className="flex flex-col items-center justify-center py-20 gap-4 opacity-20"
                          >
                            <FileText size={32} />
                            <p className="text-sm font-medium">Đang chờ xử lý...</p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto bg-white flex flex-col items-center p-8 md:p-16">
                  <div className="max-w-3xl w-full">
                    <AnimatePresence mode="wait">
                      {pages[currentPage].isTranslating ? (
                        <motion.div 
                          key="loading-text"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex flex-col items-center justify-center py-20 gap-4 opacity-40"
                        >
                          <Loader2 className="animate-spin" size={32} />
                          <p className="text-lg">Đang dịch nội dung...</p>
                        </motion.div>
                      ) : (
                        <motion.div
                          key={`text-view-${currentPage}`}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                        >
                          <div className="font-serif text-3xl leading-[1.8] text-gray-800 whitespace-pre-wrap selection:bg-[var(--color-accent)]/20">
                            {pages[currentPage].translatedText || pages[currentPage].text}
                          </div>
                          {!pages[currentPage].translatedText && (
                            <div className="mt-12 p-6 bg-orange-50 border border-orange-100 rounded-2xl text-orange-800 flex items-center gap-4">
                              <AlertCircle size={24} />
                              <div>
                                <p className="font-bold">Đang hiển thị bản gốc</p>
                                <p className="text-sm opacity-80">Trang này chưa được dịch. Vui lòng bật "Tự động dịch" hoặc chờ hệ thống xử lý.</p>
                              </div>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {/* Footer Progress Rail */}
              <div className="h-1 bg-black/5 relative group cursor-pointer" onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const percent = x / rect.width;
                setCurrentPage(Math.floor(percent * pages.length));
              }}>
                <div 
                  className="h-full bg-[var(--color-accent)] w-full absolute top-0 left-0 transition-all duration-300"
                  style={{ width: `${((currentPage + 1) / pages.length) * 100}%` }}
                />
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  Trang {currentPage + 1} / {pages.length}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Global Notification Popup */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 50 }}
            className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-md px-4"
          >
            <div className={`
              ${notification.type === 'error' ? 'bg-red-600' : notification.type === 'success' ? 'bg-green-600' : 'bg-gray-800'}
              text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-4 border border-white/10
            `}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  {notification.type === 'error' ? <AlertCircle size={18} /> : notification.type === 'success' ? <CheckCircle2 size={18} /> : <FileText size={18} />}
                </div>
                <div>
                  <p className="font-bold text-sm">
                    {notification.type === 'error' ? 'Thông báo lỗi' : notification.type === 'success' ? 'Thành công' : 'Thông tin'}
                  </p>
                  <p className="text-xs opacity-90 leading-tight">{notification.message}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {notification.index !== undefined && (
                  <button 
                    onClick={() => {
                      setCurrentPage(notification.index!);
                      setNotification(null);
                    }}
                    className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors whitespace-nowrap"
                  >
                    Đến trang
                  </button>
                )}
                <button 
                  onClick={() => setNotification(null)}
                  className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                  aria-label="Đóng"
                >
                  <XCircle size={16} />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Custom Confirm Delete Modal */}
        {deleteConfirmId && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirmId(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            {/* Modal Panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-white border border-black/5 rounded-2xl p-6 shadow-2xl max-w-sm w-full z-10"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600 mb-4 mx-auto">
                <Trash2 size={24} />
              </div>
              <h3 className="text-lg font-bold text-gray-900 text-center mb-2">Xác nhận xóa sách</h3>
              <p className="text-sm text-gray-500 text-center mb-6">
                Bạn có chắc chắn muốn xóa sách này khỏi thư viện không? Hành động này không thể hoàn tác.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-black/5 text-gray-700 hover:bg-gray-50 transition-colors font-bold text-xs uppercase tracking-widest"
                >
                  Hủy
                </button>
                <button
                  onClick={confirmDeleteBook}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors font-bold text-xs uppercase tracking-widest"
                >
                  Xóa sách
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Custom Clear Library Modal */}
        {showClearConfirm && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowClearConfirm(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            {/* Modal Panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-white border border-black/5 rounded-2xl p-6 shadow-2xl max-w-md w-full z-10"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 mb-4 mx-auto animate-bounce">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-lg font-bold text-gray-900 text-center mb-2 text-red-600 uppercase tracking-wide">Cảnh báo quan trọng</h3>
              <p className="text-sm text-gray-500 text-center mb-6 leading-relaxed">
                Bạn có chắc chắn muốn xóa <span className="font-bold text-gray-950">TOÀN BỘ</span> dữ liệu (sách dịch, thư viện, cài đặt)? <br/>
                Hành động này sẽ xóa vĩnh viễn dữ liệu trong trình duyệt của bạn và đưa ứng dụng về trạng thái ban đầu.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-black/5 text-gray-700 hover:bg-gray-50 transition-colors font-bold text-xs uppercase tracking-widest"
                >
                  Hủy
                </button>
                <button
                  onClick={confirmClearLibrary}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors font-bold text-xs uppercase tracking-widest"
                >
                  Xóa toàn bộ
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
