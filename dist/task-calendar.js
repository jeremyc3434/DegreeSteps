/* Student-requested, local calendar files. No account or network request. */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DegreeTaskCalendar = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const PLAN_URL = 'https://degreesteps.com/plan.html';
  function validDay(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value+'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value && value < '9999-12-31';
  }
  function eligible(task) {return Boolean(task && typeof task.title === 'string' && task.title.trim() && task.title.length <= 160 && task.status !== 'done' && validDay(task.dueOn));}
  function escapeText(value) {return String(value).replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'');}
  function foldLine(value) {
    const lines = []; let line = '', bytes = 0;
    for (const character of value) {
      const code = character.codePointAt(0), size = code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
      if (bytes + size > 75) {lines.push(line); line = ' '; bytes = 1;}
      line += character; bytes += size;
    }
    lines.push(line); return lines.join('\r\n');
  }
  function opaqueId(environment = root) {
    if (typeof environment.crypto?.randomUUID === 'function') return environment.crypto.randomUUID();
    if (typeof environment.crypto?.getRandomValues === 'function') {const values = new Uint8Array(16);environment.crypto.getRandomValues(values);return [...values].map(value=>value.toString(16).padStart(2,'0')).join('');}
    return Math.random().toString(36).slice(2)+Date.now().toString(36)+Math.random().toString(36).slice(2);
  }
  function build(task, options = {}) {
    if (!eligible(task)) throw Error('Save a due date for an unfinished task before adding it to your calendar.');
    const now = options.now === undefined ? new Date() : new Date(options.now);
    if (!Number.isFinite(now.getTime()) || !/^\d{4}-/.test(now.toISOString())) throw Error('A valid calendar creation date is required.');
    const token = options.uid === undefined ? opaqueId(options.environment) : options.uid;
    if (typeof token !== 'string' || !/^[a-zA-Z0-9-]{16,90}$/.test(token)) throw Error('The calendar reminder needs an opaque identifier.');
    const end = new Date(task.dueOn+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+1);
    const stamp = now.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
    return [
      'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//DegreeSteps//Student task calendar//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH',
      'BEGIN:VEVENT','UID:'+token+'@degreesteps.com','DTSTAMP:'+stamp,
      'DTSTART;VALUE=DATE:'+task.dueOn.replace(/-/g,''),'DTEND;VALUE=DATE:'+end.toISOString().slice(0,10).replace(/-/g,''),
      'SUMMARY:'+escapeText(task.title.trim()),
      'DESCRIPTION:Open your DegreeSteps plan to continue. Choose reminder notifications in your calendar app.',
      'URL:'+PLAN_URL,'END:VEVENT','END:VCALENDAR'
    ].map(foldLine).join('\r\n')+'\r\n';
  }
  function download(task, environment = root) {
    const doc = environment?.document, URLApi = environment?.URL, BlobType = environment?.Blob;
    if (!doc?.body || typeof URLApi?.createObjectURL !== 'function' || typeof BlobType !== 'function') throw Error('Calendar download is unavailable in this browser. Your task is unchanged.');
    const contents = build(task,{environment}), url = URLApi.createObjectURL(new BlobType([contents],{type:'text/calendar;charset=utf-8'}));
    let link;
    try {link = doc.createElement('a');link.href=url;link.download='degreesteps-task.ics';link.hidden=true;doc.body.append(link);link.click();}
    finally {link?.remove?.();const later = typeof environment.setTimeout === 'function' ? environment.setTimeout.bind(environment) : setTimeout;later(()=>URLApi.revokeObjectURL(url),1000);}
    return true;
  }
  return Object.freeze({PLAN_URL,validDay,eligible,escapeText,foldLine,build,download});
}));
