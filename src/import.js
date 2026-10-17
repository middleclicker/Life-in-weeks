export const ACCEPT = '.md,.markdown,.txt,.docx,.pdf,.odt,.html,.htm';
export const MAX_FILE = 50 * 1024 * 1024;

export async function readJournal(file) {
  if (file.size > MAX_FILE) throw new Error(`${file.name} is larger than 50 MB. Export a smaller document first.`);
  const extension = file.name.split('.').pop().toLowerCase();
  let text;
  if (['md', 'markdown', 'txt'].includes(extension)) {
    text = await file.text();
  } else if (extension === 'docx') {
    const { unzipSync, strFromU8 } = await import('fflate');
    const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: entry => entry.name === 'word/document.xml' && entry.originalSize <= 30_000_000 });
    if (!files['word/document.xml']) throw new Error('This Word file has no readable document text, or its text is too large. Export it as TXT.');
    const xml = new DOMParser().parseFromString(strFromU8(files['word/document.xml']), 'text/xml');
    if (xml.querySelector('parsererror')) throw new Error('This Word document could not be read. Try exporting it as TXT.');
    text = Array.from(xml.getElementsByTagNameNS('*', 'p')).map(p => Array.from(p.getElementsByTagNameNS('*', 't')).map(t => t.textContent).join('')).join('\n');
  } else if (extension === 'pdf') {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const worker = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = worker;
    const loading = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, useWasm: false, useWorkerFetch: false });
    const timeout = setTimeout(() => loading.destroy(), 120000);
    let pdf;
    try {
      pdf = await loading.promise;
      if (pdf.numPages > 1500) throw new Error('Use a PDF with at most 1,500 pages per import, or export it as text.');
      const pages = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        const content = await page.getTextContent();
        pages.push(content.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join(''));
        page.cleanup();
      }
      text = pages.join('\n\n');
    } finally { clearTimeout(timeout); await loading.destroy(); }
  } else if (extension === 'odt') {
    const { unzipSync, strFromU8 } = await import('fflate');
    const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: entry => entry.name === 'content.xml' && entry.originalSize <= 30_000_000 });
    if (!files['content.xml']) throw new Error('This ODT file has no readable text, or its text is too large. Export it as TXT.');
    const xml = new DOMParser().parseFromString(strFromU8(files['content.xml']), 'text/xml');
    text = Array.from(xml.getElementsByTagNameNS('*', 'p')).map(p => p.textContent).join('\n');
  } else if (['html', 'htm'].includes(extension)) {
    const doc = new DOMParser().parseFromString(await file.text(), 'text/html');
    doc.querySelectorAll('script, style, noscript, iframe').forEach(el => el.remove());
    doc.querySelectorAll('br').forEach(el => el.replaceWith('\n'));
    doc.querySelectorAll('p, div, h1, h2, h3, li').forEach(el => el.append('\n'));
    text = doc.body.textContent;
  } else {
    throw new Error(`“${file.name}” is not a supported document. For Google Docs, choose File → Download → Word (.docx). For older .doc files, export to .docx or .txt.`);
  }
  text = text.replace(/\u0000/g, '').trim();
  if (!text) throw new Error(`${file.name} contains no readable text. Scanned PDFs need text recognition (OCR) first.`);
  return `\n--- Source: ${file.name} ---\n${text}\n`;
}
