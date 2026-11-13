/**
 * whatsapp.js — Share helpers: WhatsApp Click-to-Chat, Web Share API (with PDF file), copy, print, PDF.
 */
var Share = {
  waUrl: function (number, text) {
    var digits = String(number || '').replace(/[^\d]/g, '');
    if (digits.length === 10) digits = APP_CONFIG.DEFAULT_COUNTRY_CODE + digits;
    return (digits ? 'https://wa.me/' + digits : 'https://wa.me/') + '?text=' + encodeURIComponent(text);
  },
  openWhatsApp: function (number, text) { window.open(Share.waUrl(number, text), '_blank', 'noopener'); },
  canShareFiles: function () { return !!(navigator.canShare && navigator.share && window.File); },

  /** Render a report DOM node to a PDF Blob with html2pdf. */
  toPdfBlob: function (el, filename) {
    var opt = { margin: [10, 10, 12, 10], filename: filename, image: { type: 'jpeg', quality: 0.95 }, html2canvas: { scale: 2, useCORS: true, logging: false }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, pagebreak: { mode: ['avoid-all', 'css', 'legacy'] } };
    return html2pdf().set(opt).from(el).outputPdf('blob');
  },
  downloadPdf: function (el, filename) {
    App.loading(true);
    return Share.toPdfBlob(el, filename).then(function (blob) { App.loading(false); var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800); App.toast('PDF downloaded', 'success'); })
      .catch(function (e) { App.loading(false); App.toast('PDF generation failed: ' + e.message, 'danger'); });
  },
  /** Native share with PDF attachment where supported (mobile browsers can send to WhatsApp). */
  sharePdf: function (el, filename, title, text) {
    if (!Share.canShareFiles()) { App.toast('Your browser cannot share files directly. Download the PDF and attach it manually in WhatsApp.', 'warning', 6000); return Share.downloadPdf(el, filename); }
    App.loading(true);
    return Share.toPdfBlob(el, filename).then(function (blob) {
      App.loading(false);
      var file = new File([blob], filename, { type: 'application/pdf' });
      if (!navigator.canShare({ files: [file] })) { App.toast('File sharing not supported here. Downloading instead.', 'warning'); return Share.downloadPdf(el, filename); }
      return navigator.share({ files: [file], title: title, text: text }).catch(function (e) { if (e.name !== 'AbortError') App.toast('Share cancelled or failed', 'warning'); });
    }).catch(function (e) { App.loading(false); App.toast('PDF generation failed: ' + e.message, 'danger'); });
  },
  print: function (el) {
    var area = U.qs('#print-area');
    area.innerHTML = el.outerHTML;
    window.print();
    setTimeout(function () { area.innerHTML = ''; }, 1000);
  },

  /** Share dialog for a report: text preview + target selection. type: 'employee' | 'department' */
  dialog: function (opts) {
    var boot = App.state.boot, s = boot.settings || {};
    var mgrNum = opts.managerNumber || '';
    var targets = [];
    if (opts.type !== 'department') {
      if (opts.selfNumber) targets.push({ value: 'self', label: 'My WhatsApp (' + opts.selfNumber + ')' });
      targets.push({ value: 'manager', label: 'Reporting manager' + (mgrNum ? ' (' + mgrNum + ')' : '') });
    }
    if (s.WHATSAPP_DEFAULT_NUMBER) targets.push({ value: 'default', label: 'Company default (' + s.WHATSAPP_DEFAULT_NUMBER + ')' });
    if (s.WHATSAPP_MANAGEMENT_NUMBER) targets.push({ value: 'management', label: 'Management (' + s.WHATSAPP_MANAGEMENT_NUMBER + ')' });
    targets.push({ value: 'custom', label: 'Enter a number' });
    targets.push({ value: 'any', label: 'Choose contact in WhatsApp (no number)' });
    var m = App.modal({ title: '<i class="bi bi-whatsapp text-success me-2"></i>Share on WhatsApp', size: 'lg',
      body: '<div class="row g-3"><div class="col-md-7"><label class="form-label">Message preview</label><div class="wa-preview" data-preview>' + U.esc(opts.text) + '</div></div>' +
        '<div class="col-md-5"><label class="form-label">Send to</label><select class="form-select" data-target>' + U.opts(targets) + '</select>' +
        '<div class="mt-2 d-none" data-custom-wrap><label class="form-label">WhatsApp number (with country code)</label><input class="form-control" data-custom placeholder="91XXXXXXXXXX"></div>' +
        '<div class="help-box mt-3"><b>PDF attachment</b><div class="small text-muted mt-1">wa.me links can prefill text only. Use <i>Share PDF</i> on a phone (native share sheet) or download the PDF and attach it manually.</div></div></div></div>',
      footer: '<button class="btn btn-light" data-copy><i class="bi bi-clipboard me-1"></i>Copy text</button>' + (opts.pdfEl ? '<button class="btn btn-outline-primary" data-share-pdf><i class="bi bi-file-earmark-pdf me-1"></i>Share PDF</button>' : '') + '<button class="btn btn-wa" data-send><i class="bi bi-whatsapp me-1"></i>Open WhatsApp</button>' });
    var sel = U.qs('[data-target]', m.el);
    sel.addEventListener('change', function () { U.qs('[data-custom-wrap]', m.el).classList.toggle('d-none', sel.value !== 'custom'); });
    var number = function () {
      var v = sel.value;
      if (v === 'self') return opts.selfNumber; if (v === 'manager') return mgrNum; if (v === 'default') return s.WHATSAPP_DEFAULT_NUMBER; if (v === 'management') return s.WHATSAPP_MANAGEMENT_NUMBER;
      if (v === 'custom') return U.qs('[data-custom]', m.el).value; return '';
    };
    U.qs('[data-copy]', m.el).addEventListener('click', function () { U.copy(opts.text).then(function () { App.toast('Report text copied', 'success'); }); });
    U.qs('[data-send]', m.el).addEventListener('click', function () {
      if (sel.value === 'manager' && !mgrNum) { App.toast('Reporting manager has no WhatsApp number configured', 'warning'); return; }
      if (sel.value === 'custom' && !U.qs('[data-custom]', m.el).value.trim()) { App.toast('Enter a number', 'warning'); return; }
      Share.openWhatsApp(number(), opts.text); m.close();
    });
    var pdfBtn = U.qs('[data-share-pdf]', m.el);
    if (pdfBtn) pdfBtn.addEventListener('click', function () { Share.sharePdf(opts.pdfEl, opts.filename || 'report.pdf', opts.title || 'Daily Work Report', opts.text.substring(0, 300)); });
    return m;
  }
};
