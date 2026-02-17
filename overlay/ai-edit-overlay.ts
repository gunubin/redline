// AI Edit Overlay - dev時のみ注入されるインラインAI編集UI

export {};

declare global {
  interface Window {
    __REDLINE_CONFIG?: {
      apiBase?: string;
      filePath?: string;
      articleSelector?: string;
    };
  }
}

const API_BASE = window.__REDLINE_CONFIG?.apiBase ?? '';
const filePath = window.__REDLINE_CONFIG?.filePath ?? '';

// --- Types ---
interface EditPayload {
  filePath: string;
  instruction: string;
  mode: 'selection' | 'file' | 'section';
  selectedText?: string;
  sectionHeading?: string;
  sectionLevel?: number;
}

interface EditResponse {
  id: string;
  original: string;
  modified: string;
  startLine: number;
  endLine: number;
  filePath: string;
  mode?: string;
}

// --- Active panel tracking (suppress redline HMR while panels open) ---
let activePanels = 0;
let pendingReload = false;

function trackPanelOpen() {
  activePanels++;
}

function trackPanelClose() {
  activePanels--;
  if (activePanels <= 0 && pendingReload) {
    pendingReload = false;
    location.reload();
  }
}

// Exposed for redline's own HMR script (normal/serve mode)
(window as any).__REDLINE_SHOULD_RELOAD = () => {
  if (activePanels > 0) {
    pendingReload = true;
    return false;
  }
  return true;
};

// --- Helper ---
const clearChildren = (el: HTMLElement) => {
  while (el.firstChild) el.removeChild(el.firstChild);
};

const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

// SVG icon helper (safe DOM creation, no innerHTML)
function createSvgIcon(pathD: string, className: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('viewBox', '0 0 24 24');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('d', pathD);
  svg.appendChild(path);
  return svg;
}

const EDIT_ICON_PATH = 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z';
const CLOSE_ICON_PATH = 'M6 18L18 6M6 6l12 12';
const UNDO_ICON_PATH = 'M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4';
const REDO_ICON_PATH = 'M21 10H11a5 5 0 00-5 5v2M21 10l-4-4M21 10l-4 4';

// --- Tailwind class maps ---
const tw = {
  btn: 'absolute z-[10000] bg-ctp-mauve text-ctp-crust border-none rounded-lg px-3.5 py-1.5 text-sm font-semibold cursor-pointer shadow-lg touch-manipulation active:bg-ctp-lavender',
  inline: 'relative my-2 border-2 border-ctp-mauve rounded-lg bg-ctp-surface0 p-3 z-[9999] shadow-lg',
  textarea: 'w-full min-h-[60px] border border-ctp-surface2 rounded-md p-2 text-sm resize-y box-border font-inherit bg-ctp-base text-ctp-text focus:outline-none focus:border-ctp-mauve',
  actions: 'flex gap-2 mt-2',
  actionBtn: 'flex-1 py-2 border-none rounded-md text-sm font-semibold cursor-pointer touch-manipulation min-h-[44px]',
  submit: 'bg-ctp-mauve text-ctp-crust disabled:bg-ctp-mauve/50 disabled:cursor-not-allowed',
  cancel: 'bg-ctp-surface1 text-ctp-text',
  loading: 'flex items-center gap-2 p-3 text-ctp-mauve text-sm',
  spinner: 'size-4 border-2 border-ctp-surface1 border-t-ctp-mauve rounded-full animate-spin',
  diff: 'my-2 border-2 border-ctp-mauve rounded-lg overflow-hidden bg-ctp-surface0 z-[9999] relative shadow-lg',
  diffHeader: 'bg-ctp-base px-3 py-2 text-xs text-ctp-subtext0 border-b border-ctp-surface1',
  diffContent: 'px-3 py-2 text-sm leading-relaxed text-ctp-text overflow-auto',
  diffDel: 'bg-ctp-red/20 line-through text-ctp-red px-1 rounded-sm block',
  diffIns: 'bg-ctp-green/20 text-ctp-green px-1 rounded-sm block',
  diffSame: 'block',
  diffCollapsed: 'text-ctp-overlay0 italic text-xs px-1 block',
  diffActions: 'flex gap-2 px-3 py-2 border-t border-ctp-surface1',
  apply: 'bg-ctp-green text-ctp-crust',
  reject: 'bg-ctp-surface1 text-ctp-text',
  reply: 'bg-ctp-mauve text-ctp-crust',
  highlight: 'bg-ctp-mauve/25 text-inherit border-b-2 border-ctp-mauve rounded-sm',
  fab: 'fixed bottom-6 right-6 z-[10000] bg-ctp-mauve text-ctp-crust border-none rounded-full w-14 h-14 text-lg font-bold cursor-pointer shadow-xl touch-manipulation active:bg-ctp-lavender flex items-center justify-center hover:scale-105 transition-transform',
  fabMenu: 'fixed bottom-[5.5rem] right-6 z-[10000] flex flex-col gap-2',
  fabMenuItem: 'min-h-[44px] px-4 py-2 rounded-lg text-sm font-semibold border-none cursor-pointer shadow-lg touch-manipulation flex items-center gap-2 whitespace-nowrap',
  fabMenuActive: 'bg-ctp-surface0 text-ctp-text active:bg-ctp-surface1',
  fabMenuDisabled: 'bg-ctp-surface1 text-ctp-overlay0 pointer-events-none',
  modal: 'fixed inset-0 z-[10001] bg-ctp-crust/60 flex items-end sm:items-center justify-center',
  modalContent: 'bg-ctp-surface0 w-full sm:max-w-lg sm:rounded-lg rounded-t-xl p-4 max-h-[80vh] overflow-auto',
  sectionBtn: 'inline-flex items-center justify-center w-8 h-8 min-w-[44px] min-h-[44px] rounded-md bg-ctp-mauve/0 hover:bg-ctp-mauve/20 text-ctp-overlay0 hover:text-ctp-mauve cursor-pointer border-none transition-colors ml-2 align-middle touch-manipulation',
  diffHistory: 'opacity-40 pointer-events-none border-b border-ctp-surface1 pb-2 mb-2',
  toast: 'fixed bottom-24 right-6 z-[10002] px-4 py-2 rounded-lg text-sm font-semibold shadow-lg transition-opacity duration-300',
  toastSuccess: 'bg-ctp-green text-ctp-crust',
  toastError: 'bg-ctp-red text-ctp-crust',
} as const;

// --- Floating Button ---
let floatingBtn: HTMLButtonElement | null = null;
let currentSelectedText = '';
let currentRange: Range | null = null;

function removeFloatingBtn() {
  if (floatingBtn) {
    floatingBtn.remove();
    floatingBtn = null;
  }
}

function showFloatingBtn(rect: DOMRect) {
  removeFloatingBtn();
  const btn = document.createElement('button');
  btn.className = tw.btn;
  btn.textContent = 'AI Edit';
  const btnWidth = 80;
  const left = Math.min(rect.left + window.scrollX, window.innerWidth - btnWidth - 8);
  btn.style.left = `${Math.max(8, left)}px`;
  btn.style.top = `${rect.bottom + window.scrollY + 6}px`;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentRange && currentSelectedText) {
      showInlineEditor(currentRange, currentSelectedText);
    }
    removeFloatingBtn();
  });
  document.body.appendChild(btn);
  floatingBtn = btn;
}

// --- Selection Handling ---
const articleSelector = window.__REDLINE_CONFIG?.articleSelector ?? '#article-body';
const articleBody = document.querySelector(articleSelector);
let dismissTimer: ReturnType<typeof setTimeout> | null = null;

document.addEventListener('selectionchange', () => {
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }

  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) {
    dismissTimer = setTimeout(() => {
      const sel2 = window.getSelection();
      if (!sel2 || sel2.isCollapsed) {
        removeFloatingBtn();
        currentSelectedText = '';
        currentRange = null;
      }
      dismissTimer = null;
    }, 200);
    return;
  }

  const range = sel.getRangeAt(0);
  if (!articleBody?.contains(range.commonAncestorContainer)) {
    removeFloatingBtn();
    return;
  }

  const text = sel.toString().trim();
  if (text.length < 5) {
    removeFloatingBtn();
    return;
  }

  currentSelectedText = text;
  currentRange = range.cloneRange();
  showFloatingBtn(range.getBoundingClientRect());
});

// --- Highlight ---
function highlightRange(range: Range): HTMLElement[] {
  const marks: HTMLElement[] = [];
  try {
    const mark = document.createElement('mark');
    mark.className = tw.highlight;
    range.surroundContents(mark);
    marks.push(mark);
  } catch {
    const treeWalker = document.createTreeWalker(
      range.commonAncestorContainer,
      NodeFilter.SHOW_TEXT,
    );
    const textNodes: Text[] = [];
    let node: Node | null;
    while ((node = treeWalker.nextNode())) {
      if (range.intersectsNode(node)) {
        textNodes.push(node as Text);
      }
    }
    for (const textNode of textNodes) {
      const mark = document.createElement('mark');
      mark.className = tw.highlight;
      textNode.parentNode?.insertBefore(mark, textNode);
      mark.appendChild(textNode);
      marks.push(mark);
    }
  }
  return marks;
}

function removeHighlights(marks: HTMLElement[]) {
  for (const mark of marks) {
    const parent = mark.parentNode;
    if (!parent) continue;
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
    parent.normalize();
  }
}

// --- Container positioning ---
function positionContainer(container: HTMLElement, rect: DOMRect) {
  if (isMobile()) {
    container.style.position = 'fixed';
    container.style.bottom = '0';
    container.style.left = '0';
    container.style.right = '0';
    container.style.top = 'auto';
    container.style.width = '100%';
    container.style.maxHeight = '70vh';
    container.style.overflowY = 'auto';
    container.style.zIndex = '10000';
    container.style.borderRadius = '12px 12px 0 0';
    return;
  }
  const gap = 8;
  const margin = 8;
  const top = rect.bottom + window.scrollY + gap;
  const maxWidth = Math.min(480, window.innerWidth - margin * 2);
  const left = Math.min(
    Math.max(margin, rect.left + window.scrollX),
    window.innerWidth - maxWidth - margin,
  );
  container.style.position = 'absolute';
  container.style.top = `${top}px`;
  container.style.left = `${left}px`;
  container.style.width = `${maxWidth}px`;
  container.style.zIndex = '10000';
}

// --- Inline Editor (for selection mode) ---
function showInlineEditor(range: Range, selectedText: string) {
  const marks = highlightRange(range);
  const rangeRect = range.getBoundingClientRect();

  const container = document.createElement('div');
  container.className = tw.inline;
  positionContainer(container, rangeRect);

  const textarea = document.createElement('textarea');
  textarea.className = tw.textarea;
  textarea.placeholder = '編集指示を入力...（例: もっと簡潔に）';

  const actions = document.createElement('div');
  actions.className = tw.actions;

  const submitBtn = document.createElement('button');
  submitBtn.className = `${tw.actionBtn} ${tw.submit}`;
  submitBtn.textContent = '送信';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = `${tw.actionBtn} ${tw.cancel}`;
  cancelBtn.textContent = 'Cancel';

  actions.appendChild(submitBtn);
  actions.appendChild(cancelBtn);

  container.appendChild(textarea);
  container.appendChild(actions);

  document.body.appendChild(container);

  textarea.focus();
  trackPanelOpen();

  const cleanup = () => {
    removeHighlights(marks);
    container.remove();
    trackPanelClose();
  };

  cancelBtn.addEventListener('click', cleanup);
  submitBtn.addEventListener('click', () => {
    const instruction = textarea.value.trim();
    if (!instruction) return;
    const payload: EditPayload = {
      filePath,
      selectedText,
      instruction,
      mode: 'selection',
    };
    submitEdit(container, payload, marks);
  });
}

// --- Submit Edit ---
async function submitEdit(
  container: HTMLElement,
  payload: EditPayload,
  marks: HTMLElement[],
) {
  clearChildren(container);
  container.className = tw.inline;

  const loadingEl = document.createElement('div');
  loadingEl.className = tw.loading;
  const spinner = document.createElement('div');
  spinner.className = tw.spinner;
  const loadingText = document.createElement('span');
  loadingText.textContent = 'Claude Code processing...';
  loadingEl.appendChild(spinner);
  loadingEl.appendChild(loadingText);
  container.appendChild(loadingEl);

  try {
    const res = await fetch(`${API_BASE}/api/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data: EditResponse = await res.json();

    if (!res.ok) {
      showError(container, (data as any).error || 'Unknown error', marks);
      return;
    }

    showDiff(container, data, marks, payload);
  } catch {
    showError(container, 'API connection failed. Is the server running?', marks);
  }
}

// --- Error display ---
function showError(container: HTMLElement, message: string, marks?: HTMLElement[]) {
  clearChildren(container);
  container.className = tw.inline;

  const errorMsg = document.createElement('div');
  errorMsg.className = 'text-ctp-red px-3 py-2 text-sm';
  errorMsg.textContent = message;

  const actions = document.createElement('div');
  actions.className = tw.actions;
  const closeBtn = document.createElement('button');
  closeBtn.className = `${tw.actionBtn} ${tw.reject}`;
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => {
    if (marks) removeHighlights(marks);
    container.remove();
    trackPanelClose();
  });
  actions.appendChild(closeBtn);

  container.appendChild(errorMsg);
  container.appendChild(actions);
}

// --- Diff Display (with reply support) ---
function showDiff(
  container: HTMLElement,
  data: EditResponse,
  marks: HTMLElement[],
  payload: EditPayload,
) {
  clearChildren(container);
  container.className = tw.diff;

  const isCompact = payload.mode === 'file';
  let latestData = data;

  // Diff history wrapper
  const historyWrapper = document.createElement('div');
  historyWrapper.dataset.role = 'history';

  // Current diff section
  const diffSection = createDiffSection(data, isCompact);
  historyWrapper.appendChild(diffSection);

  // Actions
  const actions = document.createElement('div');
  actions.className = tw.diffActions;

  const applyBtn = document.createElement('button');
  applyBtn.className = `${tw.actionBtn} ${tw.apply}`;
  applyBtn.textContent = 'Apply';

  const replyBtn = document.createElement('button');
  replyBtn.className = `${tw.actionBtn} ${tw.reply}`;
  replyBtn.textContent = 'Reply';

  const rejectBtn = document.createElement('button');
  rejectBtn.className = `${tw.actionBtn} ${tw.reject}`;
  rejectBtn.textContent = 'Reject';

  actions.appendChild(applyBtn);
  actions.appendChild(replyBtn);
  actions.appendChild(rejectBtn);

  // Reply area (hidden initially)
  const replyArea = document.createElement('div');
  replyArea.className = 'px-3 py-2 border-t border-ctp-surface1 hidden';

  const replyTextarea = document.createElement('textarea');
  replyTextarea.className = tw.textarea;
  replyTextarea.placeholder = '追加の指示を入力...';

  const replyActions = document.createElement('div');
  replyActions.className = tw.actions;

  const replySendBtn = document.createElement('button');
  replySendBtn.className = `${tw.actionBtn} ${tw.submit}`;
  replySendBtn.textContent = '送信';

  const replyCancelBtn = document.createElement('button');
  replyCancelBtn.className = `${tw.actionBtn} ${tw.cancel}`;
  replyCancelBtn.textContent = 'Cancel';

  replyActions.appendChild(replySendBtn);
  replyActions.appendChild(replyCancelBtn);

  replyArea.appendChild(replyTextarea);
  replyArea.appendChild(replyActions);

  container.appendChild(historyWrapper);
  container.appendChild(actions);
  container.appendChild(replyArea);

  // --- Event handlers ---

  applyBtn.addEventListener('click', async () => {
    applyBtn.disabled = true;
    applyBtn.textContent = 'Applying...';
    try {
      const res = await fetch(`${API_BASE}/api/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: latestData.filePath,
          startLine: latestData.startLine,
          endLine: latestData.endLine,
          modified: latestData.modified,
        }),
      });
      if (res.ok) {
        removeHighlights(marks);
        clearChildren(container);
        container.className = tw.inline;
        const successMsg = document.createElement('div');
        successMsg.className = 'p-3 text-ctp-green font-semibold text-center';
        successMsg.textContent = 'Applied!';
        container.appendChild(successMsg);
        refreshHistoryState();
        setTimeout(() => {
          container.remove();
          trackPanelClose();
        }, 2000);
      } else {
        const errData = await res.json().catch(() => ({ error: 'Apply failed' }));
        showError(container, errData.error || 'Apply failed', marks);
      }
    } catch {
      showError(container, 'API connection failed', marks);
    }
  });

  rejectBtn.addEventListener('click', () => {
    removeHighlights(marks);
    container.remove();
    trackPanelClose();
  });

  replyBtn.addEventListener('click', () => {
    replyArea.classList.remove('hidden');
    replyBtn.classList.add('hidden');
    replyTextarea.focus();
  });

  replyCancelBtn.addEventListener('click', () => {
    replyArea.classList.add('hidden');
    replyBtn.classList.remove('hidden');
    replyTextarea.value = '';
  });

  replySendBtn.addEventListener('click', async () => {
    const instruction = replyTextarea.value.trim();
    if (!instruction) return;

    // Grey out current diff
    for (const child of Array.from(historyWrapper.children)) {
      (child as HTMLElement).className = tw.diffHistory;
    }

    // Hide reply area and actions
    replyArea.classList.add('hidden');
    actions.classList.add('hidden');

    // Build new payload (same context, new instruction)
    const replyPayload: EditPayload = { ...payload, instruction };

    // Show loading in container
    const loadingEl = document.createElement('div');
    loadingEl.className = tw.loading;
    const spinnerEl = document.createElement('div');
    spinnerEl.className = tw.spinner;
    const loadingTextEl = document.createElement('span');
    loadingTextEl.textContent = 'Claude Code processing...';
    loadingEl.appendChild(spinnerEl);
    loadingEl.appendChild(loadingTextEl);
    container.appendChild(loadingEl);

    try {
      const res = await fetch(`${API_BASE}/api/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(replyPayload),
      });

      const newData: EditResponse = await res.json();
      loadingEl.remove();

      if (!res.ok) {
        actions.classList.remove('hidden');
        showError(container, (newData as any).error || 'Unknown error', marks);
        return;
      }

      // Add new diff section
      latestData = newData;
      const newDiffSection = createDiffSection(newData, isCompact);
      historyWrapper.appendChild(newDiffSection);

      // Show actions again
      actions.classList.remove('hidden');
      replyBtn.classList.remove('hidden');
      replyTextarea.value = '';
    } catch {
      loadingEl.remove();
      actions.classList.remove('hidden');
      showError(container, 'API connection failed', marks);
    }
  });
}

// --- Create a single diff section element ---
function createDiffSection(data: EditResponse, compact: boolean): HTMLElement {
  const section = document.createElement('div');

  const header = document.createElement('div');
  header.className = tw.diffHeader;
  header.textContent = `L${data.startLine}-${data.endLine}`;

  const content = document.createElement('div');
  content.className = tw.diffContent;
  if (compact) {
    buildCompactDiffDom(content, data.original, data.modified);
  } else {
    buildDiffDom(content, data.original, data.modified);
  }

  section.appendChild(header);
  section.appendChild(content);
  return section;
}

// --- DOM-based diff rendering ---
function buildDiffDom(parent: HTMLElement, original: string, modified: string) {
  const origLines = original.split('\n');
  const modLines = modified.split('\n');

  let i = 0;
  let j = 0;

  while (i < origLines.length || j < modLines.length) {
    const origLine = i < origLines.length ? origLines[i] : undefined;
    const modLine = j < modLines.length ? modLines[j] : undefined;

    if (origLine === modLine) {
      const span = document.createElement('span');
      span.className = tw.diffSame;
      span.textContent = origLine!;
      parent.appendChild(span);
      i++;
      j++;
    } else if (origLine !== undefined && modLine !== undefined) {
      const del = document.createElement('span');
      del.className = tw.diffDel;
      del.textContent = origLine;
      parent.appendChild(del);
      const ins = document.createElement('span');
      ins.className = tw.diffIns;
      ins.textContent = modLine;
      parent.appendChild(ins);
      i++;
      j++;
    } else if (origLine !== undefined) {
      const del = document.createElement('span');
      del.className = tw.diffDel;
      del.textContent = origLine;
      parent.appendChild(del);
      i++;
    } else if (modLine !== undefined) {
      const ins = document.createElement('span');
      ins.className = tw.diffIns;
      ins.textContent = modLine;
      parent.appendChild(ins);
      j++;
    }
  }
}

// --- Compact diff: show only changed lines + context ---
function buildCompactDiffDom(parent: HTMLElement, original: string, modified: string, contextLines = 3) {
  const origLines = original.split('\n');
  const modLines = modified.split('\n');

  // Find changed line pairs
  const maxLen = Math.max(origLines.length, modLines.length);
  const changed: boolean[] = [];
  for (let i = 0; i < maxLen; i++) {
    changed[i] = (origLines[i] ?? '') !== (modLines[i] ?? '');
  }

  // Determine which lines to show (changed + context)
  const visible = new Set<number>();
  for (let i = 0; i < maxLen; i++) {
    if (changed[i]) {
      for (let c = Math.max(0, i - contextLines); c <= Math.min(maxLen - 1, i + contextLines); c++) {
        visible.add(c);
      }
    }
  }

  let lastShown = -1;
  for (let i = 0; i < maxLen; i++) {
    if (!visible.has(i)) continue;

    // Show collapsed indicator for skipped lines
    if (lastShown !== -1 && i > lastShown + 1) {
      const skipped = i - lastShown - 1;
      const collapsed = document.createElement('span');
      collapsed.className = tw.diffCollapsed;
      collapsed.textContent = `... ${skipped} lines unchanged ...`;
      parent.appendChild(collapsed);
    }

    const origLine = i < origLines.length ? origLines[i] : undefined;
    const modLine = i < modLines.length ? modLines[i] : undefined;

    if (origLine === modLine) {
      const span = document.createElement('span');
      span.className = tw.diffSame;
      span.textContent = origLine!;
      parent.appendChild(span);
    } else {
      if (origLine !== undefined) {
        const del = document.createElement('span');
        del.className = tw.diffDel;
        del.textContent = origLine;
        parent.appendChild(del);
      }
      if (modLine !== undefined) {
        const ins = document.createElement('span');
        ins.className = tw.diffIns;
        ins.textContent = modLine;
        parent.appendChild(ins);
      }
    }
    lastShown = i;
  }

  // Trailing collapsed
  if (lastShown < maxLen - 1 && lastShown >= 0) {
    const skipped = maxLen - 1 - lastShown;
    const collapsed = document.createElement('span');
    collapsed.className = tw.diffCollapsed;
    collapsed.textContent = `... ${skipped} lines unchanged ...`;
    parent.appendChild(collapsed);
  }
}

// --- File-level FAB with menu ---
let fabEl: HTMLButtonElement | null = null;
let fabMenuEl: HTMLDivElement | null = null;
let fabMenuOpen = false;
let undoMenuItem: HTMLButtonElement | null = null;
let redoMenuItem: HTMLButtonElement | null = null;

function toggleFabMenu() {
  if (!fabMenuEl || !fabEl) return;
  fabMenuOpen = !fabMenuOpen;
  fabMenuEl.style.display = fabMenuOpen ? 'flex' : 'none';
  // Swap icon
  const icon = fabEl.querySelector('svg');
  if (icon) {
    const path = icon.querySelector('path');
    if (path) path.setAttribute('d', fabMenuOpen ? CLOSE_ICON_PATH : EDIT_ICON_PATH);
  }
}

function closeFabMenu() {
  if (!fabMenuOpen) return;
  fabMenuOpen = false;
  if (fabMenuEl) fabMenuEl.style.display = 'none';
  if (fabEl) {
    const path = fabEl.querySelector('path');
    if (path) path.setAttribute('d', EDIT_ICON_PATH);
  }
}

function createFab() {
  if (!filePath) return;

  // FAB button
  const fab = document.createElement('button');
  fab.className = tw.fab;
  fab.appendChild(createSvgIcon(EDIT_ICON_PATH, 'w-6 h-6'));
  fab.title = 'AI Edit';
  fab.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFabMenu();
  });
  document.body.appendChild(fab);
  fabEl = fab;

  // Menu container
  const menu = document.createElement('div');
  menu.className = tw.fabMenu;
  menu.style.display = 'none';
  menu.addEventListener('click', (e) => e.stopPropagation());

  // Edit item
  const editItem = document.createElement('button');
  editItem.className = `${tw.fabMenuItem} ${tw.fabMenuActive}`;
  editItem.appendChild(createSvgIcon(EDIT_ICON_PATH, 'w-4 h-4'));
  editItem.appendChild(document.createTextNode('Edit'));
  editItem.addEventListener('click', () => {
    closeFabMenu();
    showFileEditModal();
  });

  // Undo item
  const undoItem = document.createElement('button');
  undoItem.className = `${tw.fabMenuItem} ${tw.fabMenuDisabled}`;
  undoItem.appendChild(createSvgIcon(UNDO_ICON_PATH, 'w-4 h-4'));
  undoItem.appendChild(document.createTextNode('Undo'));
  undoItem.addEventListener('click', () => {
    if (!historyCanUndo) return;
    closeFabMenu();
    performUndo();
  });
  undoMenuItem = undoItem;

  // Redo item
  const redoItem = document.createElement('button');
  redoItem.className = `${tw.fabMenuItem} ${tw.fabMenuDisabled}`;
  redoItem.appendChild(createSvgIcon(REDO_ICON_PATH, 'w-4 h-4'));
  redoItem.appendChild(document.createTextNode('Redo'));
  redoItem.addEventListener('click', () => {
    if (!historyCanRedo) return;
    closeFabMenu();
    performRedo();
  });
  redoMenuItem = redoItem;

  menu.appendChild(editItem);
  menu.appendChild(undoItem);
  menu.appendChild(redoItem);
  document.body.appendChild(menu);
  fabMenuEl = menu;

  // Close menu on outside tap
  document.addEventListener('click', () => closeFabMenu());
}

function showFileEditModal() {
  const overlay = document.createElement('div');
  overlay.className = tw.modal;
  trackPanelOpen();

  const content = document.createElement('div');
  content.className = tw.modalContent;

  const title = document.createElement('h3');
  title.className = 'text-lg font-semibold text-ctp-text mb-3';
  title.textContent = 'ファイル全体を編集';

  const textarea = document.createElement('textarea');
  textarea.className = `${tw.textarea} min-h-[120px]`;
  textarea.placeholder = '編集指示を入力...（例: 全体を英語に翻訳して）';

  const actions = document.createElement('div');
  actions.className = tw.actions;

  const submitBtn = document.createElement('button');
  submitBtn.className = `${tw.actionBtn} ${tw.submit}`;
  submitBtn.textContent = '送信';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = `${tw.actionBtn} ${tw.cancel}`;
  cancelBtn.textContent = 'Cancel';

  actions.appendChild(submitBtn);
  actions.appendChild(cancelBtn);

  content.appendChild(title);
  content.appendChild(textarea);
  content.appendChild(actions);
  overlay.appendChild(content);
  document.body.appendChild(overlay);
  textarea.focus();

  const close = () => {
    overlay.remove();
    trackPanelClose();
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  cancelBtn.addEventListener('click', close);

  submitBtn.addEventListener('click', () => {
    const instruction = textarea.value.trim();
    if (!instruction) return;
    close();

    const payload: EditPayload = {
      filePath,
      instruction,
      mode: 'file',
    };

    // Create a container for the diff
    const diffContainer = document.createElement('div');
    diffContainer.className = tw.inline;
    if (isMobile()) {
      diffContainer.style.position = 'fixed';
      diffContainer.style.bottom = '0';
      diffContainer.style.left = '0';
      diffContainer.style.right = '0';
      diffContainer.style.top = 'auto';
      diffContainer.style.width = '100%';
      diffContainer.style.maxHeight = '70vh';
      diffContainer.style.overflowY = 'auto';
      diffContainer.style.zIndex = '10000';
      diffContainer.style.borderRadius = '12px 12px 0 0';
    } else {
      diffContainer.style.position = 'fixed';
      diffContainer.style.top = '50%';
      diffContainer.style.left = '50%';
      diffContainer.style.transform = 'translate(-50%, -50%)';
      diffContainer.style.width = `${Math.min(600, window.innerWidth - 32)}px`;
      diffContainer.style.maxHeight = '80vh';
      diffContainer.style.overflowY = 'auto';
      diffContainer.style.zIndex = '10000';
    }
    document.body.appendChild(diffContainer);
    trackPanelOpen();

    submitEdit(diffContainer, payload, []);
  });
}

// --- Section edit buttons ---
function setupSectionButtons() {
  if (!articleBody || !filePath) return;

  const headings = articleBody.querySelectorAll('h1, h2, h3');
  headings.forEach((heading) => {
    const el = heading as HTMLElement;
    const level = parseInt(el.tagName[1]!, 10);
    const text = el.textContent?.trim() ?? '';
    if (!text) return;

    el.style.position = 'relative';

    const btn = document.createElement('button');
    btn.className = tw.sectionBtn;
    btn.appendChild(createSvgIcon(EDIT_ICON_PATH, 'w-4 h-4'));
    btn.title = 'セクションを編集';

    // Mobile: always visible. Desktop: show on hover
    if (!isMobile()) {
      btn.style.opacity = '0';
      btn.style.transition = 'opacity 0.15s';
      el.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
      el.addEventListener('mouseleave', () => { btn.style.opacity = '0'; });
    }

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showSectionEditor(el, text, level);
    });

    el.appendChild(btn);
  });
}

function showSectionEditor(headingEl: HTMLElement, headingText: string, level: number) {
  const rect = headingEl.getBoundingClientRect();

  const container = document.createElement('div');
  container.className = tw.inline;
  positionContainer(container, rect);

  const label = document.createElement('div');
  label.className = 'text-xs text-ctp-subtext0 mb-2';
  label.textContent = `セクション: ${headingText}`;

  const textarea = document.createElement('textarea');
  textarea.className = tw.textarea;
  textarea.placeholder = 'セクションへの編集指示を入力...';

  const actions = document.createElement('div');
  actions.className = tw.actions;

  const submitBtn = document.createElement('button');
  submitBtn.className = `${tw.actionBtn} ${tw.submit}`;
  submitBtn.textContent = '送信';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = `${tw.actionBtn} ${tw.cancel}`;
  cancelBtn.textContent = 'Cancel';

  actions.appendChild(submitBtn);
  actions.appendChild(cancelBtn);

  container.appendChild(label);
  container.appendChild(textarea);
  container.appendChild(actions);

  document.body.appendChild(container);
  textarea.focus();
  trackPanelOpen();

  cancelBtn.addEventListener('click', () => {
    container.remove();
    trackPanelClose();
  });

  submitBtn.addEventListener('click', () => {
    const instruction = textarea.value.trim();
    if (!instruction) return;

    const payload: EditPayload = {
      filePath,
      instruction,
      mode: 'section',
      sectionHeading: headingText,
      sectionLevel: level,
    };
    submitEdit(container, payload, []);
  });
}

// --- Toast ---
function showToast(message: string, type: 'success' | 'error') {
  const toast = document.createElement('div');
  toast.className = `${tw.toast} ${type === 'success' ? tw.toastSuccess : tw.toastError}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 1500);
}

// --- Undo/Redo state ---
let historyCanUndo = false;
let historyCanRedo = false;

async function refreshHistoryState() {
  if (!filePath) return;
  try {
    const res = await fetch(
      `${API_BASE}/api/history-state?filePath=${encodeURIComponent(filePath)}`,
    );
    if (!res.ok) {
      console.warn(`[AI Edit] refreshHistoryState: HTTP ${res.status}`);
      return;
    }
    const data: { canUndo: boolean; canRedo: boolean } = await res.json();
    historyCanUndo = data.canUndo;
    historyCanRedo = data.canRedo;
    updateMenuState();
  } catch (err) {
    console.warn('[AI Edit] Failed to refresh history state:', err);
  }
}

function updateMenuState() {
  if (undoMenuItem) {
    undoMenuItem.className = `${tw.fabMenuItem} ${historyCanUndo ? tw.fabMenuActive : tw.fabMenuDisabled}`;
  }
  if (redoMenuItem) {
    redoMenuItem.className = `${tw.fabMenuItem} ${historyCanRedo ? tw.fabMenuActive : tw.fabMenuDisabled}`;
  }
}

async function performUndo() {
  if (!historyCanUndo || !filePath) return;
  try {
    const res = await fetch(`${API_BASE}/api/undo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath }),
    });
    const data = await res.json().catch(() => ({ error: 'Invalid server response' }));
    if (res.ok) {
      showToast('Undo successful', 'success');
      if (data.scrollHint) {
        sessionStorage.setItem('__REDLINE_SCROLL_HINT', data.scrollHint);
      }
    } else if (res.status === 409) {
      showToast(data.error || 'File modified externally', 'error');
    } else {
      showToast(data.error || 'Undo failed', 'error');
    }
  } catch (err) {
    console.warn('[AI Edit] performUndo failed:', err);
    showToast('API connection failed', 'error');
  }
  await refreshHistoryState();
}

async function performRedo() {
  if (!historyCanRedo || !filePath) return;
  try {
    const res = await fetch(`${API_BASE}/api/redo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath }),
    });
    const data = await res.json().catch(() => ({ error: 'Invalid server response' }));
    if (res.ok) {
      showToast('Redo successful', 'success');
      if (data.scrollHint) {
        sessionStorage.setItem('__REDLINE_SCROLL_HINT', data.scrollHint);
      }
    } else if (res.status === 409) {
      showToast(data.error || 'File modified externally', 'error');
    } else {
      showToast(data.error || 'Redo failed', 'error');
    }
  } catch (err) {
    console.warn('[AI Edit] performRedo failed:', err);
    showToast('API connection failed', 'error');
  }
  await refreshHistoryState();
}

// Scroll to affected DOM element after undo/redo reload
function normalizeForSearch(text: string): string {
  return text
    // smart quotes → straight
    .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/\u2014/g, '--')
    .replace(/\u2013/g, '-')
    .replace(/\u2026/g, '...')
    // collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

function stripMarkdownForHint(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')       // headings
    .replace(/^\s*[-*+]\s+/gm, '')     // unordered list
    .replace(/^\s*\d+\.\s+/gm, '')     // ordered list
    .replace(/\*\*(.+?)\*\*/g, '$1')   // bold
    .replace(/\*(.+?)\*/g, '$1')       // italic
    .replace(/`(.+?)`/g, '$1')         // inline code
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // links
    .replace(/<\/?[a-zA-Z][^>]*>/g, '') // HTML tags
    .trim();
}

function findElementByText(root: Element, needle: string): HTMLElement | null {
  // Build concatenated textContent for each block-level element, then match.
  // This handles text split across inline child nodes (e.g. <strong>, <code>).
  const blocks = Array.from(root.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, figcaption, dt, dd'));
  for (const el of blocks) {
    const elText = normalizeForSearch(el.textContent ?? '');
    if (elText.includes(needle)) {
      return el as HTMLElement;
    }
  }
  return null;
}

function scrollToHint() {
  const hint = sessionStorage.getItem('__REDLINE_SCROLL_HINT');
  if (!hint) return;
  sessionStorage.removeItem('__REDLINE_SCROLL_HINT');

  const plainHint = normalizeForSearch(stripMarkdownForHint(hint));
  if (!plainHint || plainHint.length < 4) return;

  const selector = window.__REDLINE_CONFIG?.articleSelector ?? 'body';
  const root = document.querySelector(selector);
  if (!root) return;

  // Try progressively shorter needles (50 → 30 → 15 chars)
  const lengths = [50, 30, 15];
  let target: HTMLElement | null = null;
  for (const len of lengths) {
    const needle = plainHint.slice(0, Math.min(len, plainHint.length));
    target = findElementByText(root, needle);
    if (target) break;
  }

  if (!target) return;

  target.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Brief highlight flash
  const prev = target.style.transition;
  const prevBg = target.style.backgroundColor;
  target.style.transition = 'background-color 0.3s';
  target.style.backgroundColor = 'rgba(249, 226, 175, 0.35)'; // ctp-yellow 35%
  setTimeout(() => {
    target!.style.backgroundColor = prevBg;
    setTimeout(() => { target!.style.transition = prev; }, 300);
  }, 1500);
}

// --- Initialize ---
createFab();
setupSectionButtons();
refreshHistoryState();

// Delay scroll hint to ensure DOM is fully rendered (SPA hydration, etc.)
setTimeout(scrollToHint, 300);

console.log('[AI Edit] Overlay loaded for', filePath);
