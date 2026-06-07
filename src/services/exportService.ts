import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { BookmarkItem } from "./storageService";

export async function exportToPdf(
  title: string, 
  pages: { translatedText?: string; text: string }[],
  outline?: BookmarkItem[]
) {
  const doc = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - (margin * 2);

  // Create a hidden container for rendering
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = `${contentWidth}mm`;
  container.style.padding = '0';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#1a1a1a';
  container.style.fontFamily = '"Inter", "Helvetica", sans-serif';
  container.style.fontSize = '12pt';
  container.style.lineHeight = '1.6';
  document.body.appendChild(container);

  try {
    for (let i = 0; i < pages.length; i++) {
        if (i > 0) doc.addPage();

        // Clear and prepare content for this page
        container.innerHTML = '';

        // Body
        const body = document.createElement('div');
        body.style.whiteSpace = 'pre-wrap';
        body.innerText = pages[i].translatedText || pages[i].text;
        container.appendChild(body);

        // Render this HTML to canvas
        const canvas = await html2canvas(container, {
            scale: 2, // High resolution
            useCORS: true,
            backgroundColor: '#ffffff',
            width: container.offsetWidth,
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const imgWidth = contentWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        // If content is very long, it might need additional pages in jsPDF
        // For simplicity in books, we assume each "book page" fits near one "A4 page" 
        // or we scale it to fit.
        const ratio = Math.min(1, (pageHeight - margin * 2) / imgHeight);
        const finalWidth = imgWidth * ratio;
        const finalHeight = imgHeight * ratio;

        doc.addImage(imgData, 'JPEG', margin, margin, finalWidth, finalHeight);
    }

    if (outline && outline.length > 0) {
      try {
        const addPdfOutline = (items: BookmarkItem[], parentNode: any = null) => {
          for (const item of items) {
            const node = doc.outline.add(parentNode, item.title, { pageNumber: item.pageNumber });
            if (item.items && item.items.length > 0) {
              addPdfOutline(item.items, node);
            }
          }
        };
        addPdfOutline(outline);
      } catch (err) {
        console.warn("Could not generate PDF bookmarks", err);
      }
    }

    doc.save(`${title.replace(/\.[^/.]+$/, "")}_translated.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}
