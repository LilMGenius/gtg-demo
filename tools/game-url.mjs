// The local game page a browser gate opens. A first visit opens in English (pickLang in
// web/src/ui/i18n.mjs), while these gates compare the Korean strings the code paints, so lang=ko pins
// that source language. The English layer has its own gate: i18n-view-gate walks every panel under ?lang=en.
// A gate that measures the screen a visitor gets (live-gate) reads the page's language and expects text
// through translate() instead of opening this URL.
export const GAME = 'http://127.0.0.1:10310/web/index.html';
export const gameUrl = (query = '') => GAME + '?' + (query ? query + '&' : '') + 'lang=ko';
