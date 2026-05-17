import JSZip from "jszip";

/**
 * Generates an EPUB file from book pages.
 * EPUB is the modern standard for ebooks, supported by Kindle and most e-readers.
 * Traditionally, PRC/MOBI was used for Kindle, but Amazon has shifted to EPUB.
 */
export async function exportToEpub(title: string, pages: { translatedText?: string; text: string }[]) {
  const zip = new JSZip();

  // 1. Mimetype (must be the first file and uncompressed)
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  // 2. Container
  zip.file("META-INF/container.xml", `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

  // 3. Content (XHTML pages)
  let manifestItems = "";
  let spineItems = "";
  
  for (let i = 0; i < pages.length; i++) {
    const filename = `page_${i + 1}.xhtml`;
    const content = pages[i].translatedText || pages[i].text;
    
    // Simple HTML escaping
    const escapedContent = content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br/>");

    const xhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${title} - Page ${i + 1}</title>
  <style>
    body { font-family: sans-serif; padding: 1em; line-height: 1.5; }
    h1 { font-size: 1.2em; border-bottom: 1px solid #ccc; padding-bottom: 0.5em; }
  </style>
</head>
<body>
  <h1>${title} - Trang ${i + 1}</h1>
  <div class="content">
    ${escapedContent}
  </div>
</body>
</html>`;

    zip.file(`OEBPS/${filename}`, xhtml);
    manifestItems += `<item id="page${i + 1}" href="${filename}" media-type="application/xhtml+xml"/>\n`;
    spineItems += `<itemref idref="page${i + 1}"/>\n`;
  }

  // 4. Content.opf
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${title}</dc:title>
    <dc:language>vi</dc:language>
    <dc:identifier id="bookid">urn:uuid:${typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2)}</dc:identifier>
    <dc:creator>AI Book Translator</dc:creator>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    ${manifestItems}
  </manifest>
  <spine toc="ncx">
    ${spineItems}
  </spine>
</package>`;
  zip.file("OEBPS/content.opf", opf);

  // 5. TOC.ncx (for navigation)
  let navPoints = "";
  for (let i = 0; i < pages.length; i++) {
    navPoints += `<navPoint id="navPoint-${i + 1}" playOrder="${i + 1}">
      <navLabel><text>Trang ${i + 1}</text></navLabel>
      <content src="page_${i + 1}.xhtml"/>
    </navPoint>\n`;
  }

  const ncx = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx-2005-1.dtd" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:123"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${title}</text></docTitle>
  <navMap>
    ${navPoints}
  </navMap>
</ncx>`;
  zip.file("OEBPS/toc.ncx", ncx);

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title.replace(/\.[^/.]+$/, "")}_translated.epub`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generates a plain text (TXT) file.
 */
export async function exportToTxt(title: string, pages: { translatedText?: string; text: string }[]) {
  let content = `${title}\n\n`;
  pages.forEach((page, i) => {
    content += `--- TRANG ${i + 1} ---\n\n`;
    content += (page.translatedText || page.text) + "\n\n";
  });

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title.replace(/\.[^/.]+$/, "")}_translated.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
