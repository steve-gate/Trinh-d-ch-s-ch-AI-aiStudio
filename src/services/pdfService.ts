import * as pdfjs from 'pdfjs-dist';

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
