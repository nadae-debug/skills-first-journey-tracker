/**
 * Definitions ("Definitions" tab) — the classification rubric behind the
 * app's hover tooltips and the Definitions page. Read live so admins can fix
 * wording in Sheets without a code change; Setup.gs seeds this tab once from
 * DEFINITIONS_SEED (see Seed.gs) the first time it runs.
 */

function readDefinitions_() {
  var sh = findSheet_(TAB_DEFINITIONS);
  if (!sh) return DEFINITIONS_SEED;
  var t = readTable_(sh);
  return t.rows.map(function (r) {
    return { id: get_(r, 'id'), defType: get_(r, 'defType'), category: get_(r, 'category'), type: get_(r, 'type'), definition: get_(r, 'definition'), evidence: get_(r, 'evidence') };
  });
}

/**
 * Resources ("Resources" tab) — the Ad Council board resources page content.
 * Read live so this stays admin-editable in Sheets, same as Definitions.
 *
 * Columns: Section | Title | Body | Link. Section is free text but must say
 * which of the three groups a row belongs in — any of the labels below are
 * accepted (case-insensitive), so type whichever reads naturally:
 *   - "Universal menu"              -> how ANY board member can help
 *   - "Turnkey" / "Before joining TTPC" -> first steps before formally joining
 *   - "Board-only" / "Exclusive"    -> perks exclusive to Ad Council board members
 * Unrecognized Section values are skipped (not shown), so a typo just means
 * that row silently doesn't appear — check spelling against the list above.
 *
 * Link is optional — add a URL to a row and the app shows it as a clickable
 * link plus a one-click "Copy link" button under that item, so board members
 * can grab and share it without hunting for the source themselves. Leave it
 * blank for a resource that isn't a specific URL (e.g. "Host or speak at a
 * coalition event"). If the tab doesn't have a Link column yet, add one —
 * existing rows are untouched (get_() just returns '' for a missing cell).
 */
var RESOURCE_SECTION_ALIASES = {
  'universal menu': 'universalMenu', 'universalmenu': 'universalMenu',
  'turnkey': 'turnkey', 'before joining ttpc': 'turnkey', 'turnkey (before joining ttpc)': 'turnkey',
  'board-only': 'exclusive', 'board only': 'exclusive', 'exclusive': 'exclusive', 'board-only (exclusive)': 'exclusive',
};

function readResources_() {
  var sh = findSheet_(TAB_RESOURCES);
  if (!sh) return RESOURCES_SEED;
  var t = readTable_(sh);
  var out = { universalMenu: [], turnkey: [], exclusive: [] };
  t.rows.forEach(function (r) {
    var raw = get_(r, 'Section');
    var section = RESOURCE_SECTION_ALIASES[raw.toLowerCase().trim()] || (out[raw] ? raw : null);
    var item = { title: get_(r, 'Title'), body: get_(r, 'Body'), link: get_(r, 'Link') };
    if (section && out[section] && item.title) out[section].push(item);
  });
  return out;
}
