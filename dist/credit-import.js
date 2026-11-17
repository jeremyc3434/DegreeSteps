/* Shared bulk-import instructions. Example courses are never included in downloads. */
(function () {
  'use strict';
  const columns = [
    ['provider','Required. Original school or credit provider, such as Sophia, Study.com, StraighterLine, or your college.'],
    ['code','Original course or exam code. Recommended for matching; leave blank if unknown.'],
    ['title','Required. Course, exam, or credential name as shown on your record.'],
    ['credits','Original source credits, such as 3 or 4.5. Leave blank if unknown; do not copy a receiving school’s award into this column.'],
    ['creditSystem','semester, quarter, or competency-unit. Leave blank if unknown; missing units are never assumed to be semester credits.'],
    ['status','earned = completed; in-progress = currently taking; planned = not started; saved = a course of interest. Leave blank if unknown and choose it during review.'],
    ['grade','Optional final grade as printed on your record, such as A, B, or Pass.'],
    ['score','Optional exam score as printed on your record, such as a CLEP score.'],
    ['completedOn','Completion date in YYYY-MM-DD format, such as 2025-06-15. In Excel, format this column as Text to keep the date unchanged. Leave blank if unknown.']
  ];
  const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function helpHTML() {
    return '<section class="credit-import-guide" aria-label="Spreadsheet template and instructions"><div class="sheet-actions"><a class="button secondary" data-credit-template href="data/credit-import-template.xlsx" download="degreesteps-course-template.xlsx">Download Excel template</a><a class="button secondary" data-credit-template href="data/credit-import-template.csv" download="degreesteps-course-template.csv">Download CSV template</a></div><ol class="credit-import-steps"><li>Open a template in Excel or Google Sheets. Keep the column names in row 1.</li><li>Add one course per row, starting on row 2. Use the original school or provider and course title. Leave details you do not know blank.</li><li><a href="import-courses.html">Upload your spreadsheet or transcript</a>, then review all courses together before adding them.</li></ol><details class="credit-import-example"><summary>See labeled example rows</summary><p>Examples only. Both downloaded templates have a blank course table.</p><div class="credit-template-scroll" tabindex="0" role="region" aria-label="Example CSV worksheet"><table><caption class="screen-reader-only">Nine CSV columns, with numbered example rows</caption><thead><tr><th scope="col">Row</th>'+columns.map((_,i)=>'<th scope="col">'+String.fromCharCode(65+i)+'</th>').join('')+'</tr></thead><tbody><tr><th scope="row">1 · Headers</th>'+columns.map(c=>'<td><strong>'+c[0]+'</strong></td>').join('')+'</tr><tr><th scope="row">2 · Example</th>'+['Sophia','SOPH-0015','English Composition I','3','semester','earned','Pass','','2025-06-15'].map(c=>'<td>'+escape(c)+'</td>').join('')+'</tr><tr><th scope="row">3 · Example</th>'+['Your College','MAT101','College Algebra','4','quarter','in-progress','','',''].map(c=>'<td>'+escape(c)+'</td>').join('')+'</tr></tbody></table></div></details><details class="credit-import-columns"><summary>Column guide and allowed values</summary><dl>'+columns.map(c=>'<div><dt>'+c[0]+'</dt><dd>'+escape(c[1])+'</dd></div>').join('')+'</dl></details></section>';
  }
  window.DegreeCreditImport = Object.freeze({helpHTML});
}());
