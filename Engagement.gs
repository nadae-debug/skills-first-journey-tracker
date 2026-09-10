/**
 * Website engagement (visits to opportunityatwork.org / tearthepaperceiling.org
 * by company). Reads TAB_ENGAGEMENT live if it exists; otherwise falls back
 * to ENGAGEMENT_SEED (the static snapshot the prototype shipped with — see
 * Seed.gs). Point TAB_ENGAGEMENT (Config.gs) at a real tab, with the same
 * columns as the seed's shape below, once the workbook has one.
 *
 * Expected columns if/when a live tab is added: Company, Total Visits,
 * Unique Pages, O@W Visits, TTPC Visits, Most Recent Week, Top Pages (JSON
 * array of {url, visits[, title]}, or up to 5 "Top Page N URL"/"Top Page N
 * Visits" column pairs).
 *
 * A page shows as a hyperlink using its title/label, not the raw URL, so
 * viewers get context without a wall of long URLs. Google Sheets' own
 * rich-text hyperlinks (Insert > Link) can't be read back as separate
 * display-text + URL through SpreadsheetApp, so — same convention as
 * Resources' Link column (Definitions.gs) — type each "Top Page N URL" cell
 * as `Page title | https://the/actual/url` and the title before the `|`
 * becomes the link text; a bare URL with no `|` just shows the URL itself
 * (protocol stripped), same as before this existed. The JSON "Top Pages"
 * form can set the same thing directly via a "title" field per entry.
 */

function readEngagement_() {
  var sh = findSheet_(TAB_ENGAGEMENT);
  if (!sh) return ENGAGEMENT_SEED.map(function (e) { return e; });
  var t = readTable_(sh);
  return t.rows.map(function (r) {
    var topPages = safeJsonParse_(get_(r, 'Top Pages'), null);
    if (topPages) {
      topPages = topPages.map(function (p) { return { url: p.url, visits: p.visits, title: p.title || '' }; });
    } else {
      topPages = [];
      for (var i = 1; i <= 5; i++) {
        var parsed = parseLabeledUrl_(get_(r, 'Top Page ' + i + ' URL'));
        if (!parsed) continue;
        var visits = get_(r, 'Top Page ' + i + ' Visits');
        topPages.push({ url: parsed.url, title: parsed.label, visits: visits ? parseFloat(visits) : null });
      }
    }
    var company = get_(r, 'Company');
    var oaw = parseFloat(get_(r, 'O&W Visits') || get_(r, 'O@W Visits')) || 0;
    var ttpc = parseFloat(get_(r, 'TTPC Visits')) || 0;
    var rawTotal = parseFloat(get_(r, 'Total Visits')) || 0;
    // The KPI row at the top of the Website Engagement page shows "Total
    // visits" alongside the O@W/TTPC breakdown, and those two should always
    // add up to it — there's no third tracked property. Rather than trust
    // a separately-typed "Total Visits" cell to stay in sync with the O&W/
    // TTPC columns (easy to let drift when updating one and not the other),
    // derive it from the breakdown whenever either is present; only fall
    // back to the raw cell for a row that has no breakdown recorded at all.
    var total = (oaw || ttpc) ? (oaw + ttpc) : rawTotal;
    return {
      company: company, id: slugify_(company),
      total: total,
      unique: parseFloat(get_(r, 'Unique Pages')) || 0,
      oaw: oaw,
      ttpc: ttpc,
      recentWeek: get_(r, 'Most Recent Week'),
      logo: get_(r, 'Logo'),
      topPages: topPages,
    };
  });
}
