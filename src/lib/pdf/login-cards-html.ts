import QRCode from 'qrcode';
import {
  type LoginCardLayout,
  type StudentCardData,
  type ClassCardData,
  type RenderLoginCardsHtmlOptions,
  lookupPasswordOption,
  buildDuplexCardGrid,
  chunkStudents,
} from './login-cards-shared';

export type {
  LoginCardLayout,
  StudentCardData,
  ClassCardData,
  RenderLoginCardsHtmlOptions,
};
export { lookupPasswordOption, buildDuplexCardGrid, chunkStudents };

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderQrSvg(loginUrl: string | null): string {
  if (!loginUrl) {
    return `<div class="qr-placeholder">No login token</div>`;
  }
  let svg = '';
  QRCode.toString(
    loginUrl,
    {
      type: 'svg',
      margin: 1,
      width: 130,
      errorCorrectionLevel: 'M',
    },
    (err, result) => {
      if (!err && result) {
        svg = result.replace('<svg ', '<svg class="qr-svg" ');
      }
    },
  );
  return svg || `<div class="qr-placeholder">QR generation failed</div>`;
}

function renderQrCardHtml(
  student: StudentCardData,
  className: string,
  baseUrl: string,
): string {
  const loginUrl = student.loginToken ? `${baseUrl}/s/${student.loginToken}` : null;
  const qrSvg = renderQrSvg(loginUrl);

  return `
    <div class="card card-front">
      <div class="card-inner">
        <div class="card-header">
          <div class="student-name">${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</div>
          <div class="class-name">${escapeHtml(className)}</div>
        </div>

        <div class="qr-container">
          ${qrSvg}
        </div>

        <div class="badge-box badge-green">
          <div class="badge-title">Scan to Log In</div>
          <div class="badge-desc">Scan with camera or Starling Rise app</div>
        </div>

        <div class="card-footer">
          Permanent login QR code · Keep this card safe
        </div>
      </div>
    </div>
  `;
}

function renderPasscodeCardHtml(
  student: StudentCardData,
  className: string,
  classLoginUrl: string,
  classLoginUrlDisplay: string,
): string {
  const password = lookupPasswordOption(student);
  const passwordDisplay = password
    ? `<div class="password-value">
        <span class="password-emoji">${password.emoji}</span>
        <span class="password-name">${escapeHtml(password.name)}</span>
       </div>`
    : `<div class="password-missing">Ask teacher for picture password</div>`;

  return `
    <div class="card card-back">
      <div class="card-inner">
        <div class="card-header">
          <div class="student-name">${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</div>
          <div class="class-name">${escapeHtml(className)}</div>
        </div>

        <div class="badge-box badge-blue">
          <div class="badge-title">Step 1 — Go to website</div>
          <div class="url-text">${escapeHtml(classLoginUrlDisplay)}</div>
        </div>

        <div class="badge-box badge-purple">
          <div class="badge-title">Step 2 — Tap your picture</div>
          ${passwordDisplay}
        </div>

        <div class="card-footer">
          Tap your name, then tap your picture to log in
        </div>
      </div>
    </div>
  `;
}

function renderEmptyCardHtml(): string {
  return `<div class="card card-empty"><div class="card-inner"></div></div>`;
}

/**
 * Builds the complete standalone printable HTML document for login cards.
 */
export function renderLoginCardsHtml({
  classData,
  students,
  baseUrl,
  layout,
}: RenderLoginCardsHtmlOptions): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const classLoginUrl = classData.slug
    ? `${cleanBase}/c/${classData.slug}`
    : `${cleanBase}/student-login/${classData.id}`;
  const classLoginUrlDisplay = classData.slug
    ? `${cleanBase.replace(/^https?:\/\//, '')}/c/${classData.slug}`
    : `${cleanBase.replace(/^https?:\/\//, '')}/student-login/${classData.id}`;

  const chunks = chunkStudents(students, 4);
  const pagesHtml: string[] = [];

  for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
    const chunk = chunks[cIdx]!;
    // Pad chunk to 4 items with nulls for consistent grid slots
    const paddedChunk: (StudentCardData | null)[] = [
      chunk[0] ?? null,
      chunk[1] ?? null,
      chunk[2] ?? null,
      chunk[3] ?? null,
    ];

    if (layout === 'double_sided') {
      const { front, back } = buildDuplexCardGrid(paddedChunk);

      // Sheet Front (QR codes)
      const frontCards = front.map((s) =>
        s ? renderQrCardHtml(s, classData.name, cleanBase) : renderEmptyCardHtml(),
      );
      pagesHtml.push(`
        <div class="print-page print-sheet-front">
          <div class="print-grid">
            ${frontCards.join('')}
          </div>
        </div>
      `);

      // Sheet Back (Passcodes - horizontally mirrored)
      const backCards = back.map((s) =>
        s
          ? renderPasscodeCardHtml(s, classData.name, classLoginUrl, classLoginUrlDisplay)
          : renderEmptyCardHtml(),
      );
      pagesHtml.push(`
        <div class="print-page print-sheet-back">
          <div class="print-grid">
            ${backCards.join('')}
          </div>
        </div>
      `);
    } else if (layout === 'qr') {
      // Single-sided QR
      const cards = paddedChunk.map((s) =>
        s ? renderQrCardHtml(s, classData.name, cleanBase) : renderEmptyCardHtml(),
      );
      pagesHtml.push(`
        <div class="print-page print-sheet-qr">
          <div class="print-grid">
            ${cards.join('')}
          </div>
        </div>
      `);
    } else {
      // Single-sided Passcode (standard reading order)
      const cards = paddedChunk.map((s) =>
        s
          ? renderPasscodeCardHtml(s, classData.name, classLoginUrl, classLoginUrlDisplay)
          : renderEmptyCardHtml(),
      );
      pagesHtml.push(`
        <div class="print-page print-sheet-passcode">
          <div class="print-grid">
            ${cards.join('')}
          </div>
        </div>
      `);
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Login Cards - ${escapeHtml(classData.name)}</title>
  <style>
    @page {
      size: letter portrait;
      margin: 0.4in;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #ffffff;
      color: #111827;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .print-page {
      width: 100%;
      height: 10.2in;
      page-break-after: always;
      break-after: page;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
    }
    .print-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }

    .print-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
      gap: 0.25in;
      width: 100%;
      height: 100%;
    }

    .card {
      border: 2px dashed #cbd5e1;
      border-radius: 12px;
      padding: 0.2in;
      background: #ffffff;
      height: 4.85in;
      max-height: 4.85in;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-sizing: border-box;
      overflow: hidden;
    }

    .card-empty {
      border: 2px dashed transparent;
      background: transparent;
      visibility: hidden;
    }

    .card-inner {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 100%;
      text-align: center;
    }

    .card-header {
      margin-bottom: 0.1in;
    }
    .student-name {
      font-size: 1.25rem;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.2;
    }
    .class-name {
      font-size: 0.85rem;
      font-weight: 500;
      color: #64748b;
      margin-top: 2px;
    }

    .qr-container {
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 0.1in 0;
    }
    .qr-svg {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 6px;
      background: #ffffff;
    }
    .qr-placeholder {
      width: 130px;
      height: 130px;
      border: 1px dashed #cbd5e1;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      color: #94a3b8;
    }

    .badge-box {
      border-radius: 8px;
      padding: 0.1in 0.12in;
      margin: 0.06in 0;
      text-align: center;
    }
    .badge-green {
      background-color: #f0fdf4;
      border: 1px solid #bbf7d0;
    }
    .badge-green .badge-title {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #15803d;
    }
    .badge-green .badge-desc {
      font-size: 0.8rem;
      color: #166534;
      margin-top: 2px;
    }

    .badge-blue {
      background-color: #eff6ff;
      border: 1px solid #bfdbfe;
    }
    .badge-blue .badge-title {
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #1d4ed8;
    }
    .badge-blue .url-text {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.85rem;
      font-weight: 700;
      color: #1e3a8a;
      word-break: break-all;
      margin-top: 2px;
    }

    .badge-purple {
      background-color: #faf5ff;
      border: 1px solid #e9d5ff;
    }
    .badge-purple .badge-title {
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #7e22ce;
    }
    .password-value {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-top: 4px;
    }
    .password-emoji {
      font-size: 2.5rem;
      line-height: 1;
    }
    .password-name {
      font-size: 1.15rem;
      font-weight: 700;
      color: #581c87;
    }
    .password-missing {
      font-size: 0.8rem;
      font-style: italic;
      color: #7e22ce;
      margin-top: 4px;
    }

    .card-footer {
      font-size: 0.72rem;
      color: #64748b;
      margin-top: 0.06in;
    }
  </style>
</head>
<body>
  ${pagesHtml.join('')}
</body>
</html>`;
}
