/**
 * Website engagement (visits to opportunityatwork.org / tearthepaperceiling.org
 * by company). Reads TAB_ENGAGEMENT live if it exists; otherwise falls back
 * to ENGAGEMENT_SEED (the static snapshot the prototype shipped with — see
 * Seed.gs). Point TAB_ENGAGEMENT (Config.gs) at a real tab, with the same
 * columns as the seed's shape below, once the workbook has one.
 *
 * Expected columns if/when a live tab is added: Company, Total Visits,
 * Unique Pages, O@W Visits, TTPC Visits, Most Recent Week, Top Pages (JSON
 * array of {url, visits}, or up to 5 "Top Page N URL"/"Top Page N Visits"
 * column pairs).
 */

function readEngagement_() {
  var sh = findSheet_(TAB_ENGAGEMENT);
  if (!sh) return ENGAGEMENT_SEED.map(function (e) { return e; });
  var t = readTable_(sh);
  return t.rows.map(function (r) {
    var topPages = safeJsonParse_(get_(r, 'Top Pages'), null);
    if (!topPages) {
      topPages = [];
      for (var i = 1; i <= 5; i++) {
        var url = get_(r, 'Top Page ' + i + ' URL');
        if (!url) continue;
        var visits = get_(r, 'Top Page ' + i + ' Visits');
        topPages.push({ url: url, visits: visits ? parseFloat(visits) : null });
      }
    }
    var company = get_(r, 'Company');
    return {
      company: company, id: slugify_(company),
      total: parseFloat(get_(r, 'Total Visits')) || 0,
      unique: parseFloat(get_(r, 'Unique Pages')) || 0,
      oaw: parseFloat(get_(r, 'O&W Visits') || get_(r, 'O@W Visits')) || 0,
      ttpc: parseFloat(get_(r, 'TTPC Visits')) || 0,
      recentWeek: get_(r, 'Most Recent Week'),
      logo: get_(r, 'Logo'),
      topPages: topPages,
    };
  });
}
