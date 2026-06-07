import * as pdfjs from 'pdfjs-dist';
import { BookmarkItem } from './storageService';

// Set up worker using new URL() to get a robust URL for the worker file in Vite/ESM
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

export interface PageContent {
  pageNumber: number;
  text: string;
}

export async function extractTextFromPdf(file: File): Promise<PageContent[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  const pages: PageContent[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    
    pages.push({
      pageNumber: i,
      text: text.trim(),
    });
  }

  return pages;
}

/**
 * Extracts built-in bookmarks (the table of contents outline) from a PDF.
 */
export async function extractOutlineFromPdf(file: File): Promise<BookmarkItem[]> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    const originalOutline = await pdf.getOutline();
    if (!originalOutline || originalOutline.length === 0) {
      return [];
    }

    const mapOutlineItem = async (item: any): Promise<BookmarkItem | null> => {
      let pageNumber = -1;
      if (item.dest) {
        try {
          let destObj = item.dest;
          if (typeof destObj === 'string') {
            destObj = await pdf.getDestination(destObj);
          }
          if (Array.isArray(destObj) && destObj.length > 0) {
            const pageRef = destObj[0];
            const pageIndex = await pdf.getPageIndex(pageRef);
            pageNumber = pageIndex + 1;
          }
        } catch (e) {
          console.warn("Could not retrieve page number for outline item:", item.title, e);
        }
      }

      const title = typeof item.title === 'string' ? item.title.trim() : "";
      if (!title) return null;

      const subItems: BookmarkItem[] = [];
      if (item.items && Array.isArray(item.items)) {
        for (const sub of item.items) {
          const mapped = await mapOutlineItem(sub);
          if (mapped) subItems.push(mapped);
        }
      }

      return {
        title,
        pageNumber: pageNumber > 0 ? pageNumber : 1,
        items: subItems.length > 0 ? subItems : undefined
      };
    };

    const mappedOutline: BookmarkItem[] = [];
    for (const item of originalOutline) {
      const mapped = await mapOutlineItem(item);
      if (mapped) mappedOutline.push(mapped);
    }

    return mappedOutline;
  } catch (error) {
    console.warn("Failed to extract outline from PDF", error);
    return [];
  }
}

/**
 * Generates an automatic fallback list of bookmarks from text contents.
 * Scans the first lines of pages to detect structures like "Chapter 1", "Prologue", or character names (eg. Bran, Jon).
 */
export function generateFallbackOutline(pages: PageContent[]): BookmarkItem[] {
  const outline: BookmarkItem[] = [];
  const chapterRegex = /^(chapter|chương|phần|part|prologue|epilogue|mở đầu|lời khuyên|lời mở đầu|vĩ thanh|lời kết|giới thiệu|tiền đề|kết luận|preface|introduction)\b/i;
  
  // Character/chapter names from popular fantasy and literature (Game of Thrones, etc.)
  const gotNames = ["prologue", "epilogue", "bran", "catelyn", "daenerys", "eddard", "jon", "arya", "sansa", "tyrion", "davos", "theon", "jaime", "brienne", "cersei", "samwell", "melisandre", "barristan", "areo", "arianne", "connington", "quentyn", "patre", "victarion", "aeron"];

  let lastChapterPage = -999;

  for (const page of pages) {
    const text = page.text.trim();
    if (!text) continue;

    // Get the first line or first clean text segment
    const lines = text.split(/[\n\r]+/);
    if (lines.length === 0) continue;
    
    const firstLine = lines[0].trim();
    if (firstLine.length === 0) continue;

    const firstWords = firstLine.split(/\s+/).slice(0, 4).join(" ");
    const startWordsLower = firstWords.toLowerCase();

    let matchedTitle = "";
    let isMatch = false;

    // 1. Check chapter regex (e.g., "Chapter 1", "Chương Một")
    if (chapterRegex.test(startWordsLower)) {
      isMatch = true;
      matchedTitle = firstLine.length < 50 ? firstLine : firstWords;
    }
    // 2. Check standalone names/chapters (short line)
    else if (firstLine.length < 25) {
      const singleWord = firstLine.toLowerCase().replace(/[^a-z]/g, "");
      if (gotNames.includes(singleWord) || /^(chapter|chương|phần|part)\s+/i.test(firstLine)) {
        isMatch = true;
        matchedTitle = firstLine;
      }
    }

    if (isMatch && page.pageNumber - lastChapterPage >= 1) {
      if (matchedTitle.length > 45) {
        matchedTitle = matchedTitle.slice(0, 42) + "...";
      }
      outline.push({
        title: matchedTitle,
        pageNumber: page.pageNumber
      });
      lastChapterPage = page.pageNumber;
    }
  }

  // If no landmarks could be set, make bookmarks for every 10 pages so navigation stays easy
  if (outline.length === 0 && pages.length > 5) {
    for (let i = 0; i < pages.length; i += 10) {
      outline.push({
        title: `Trang ${i + 1}`,
        pageNumber: i + 1
      });
    }
  }

  return outline;
}
