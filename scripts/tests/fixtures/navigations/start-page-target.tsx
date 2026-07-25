// Used alongside a manifest.ts with startPage set to this page's bare folder name —
// proves resolveStartPageId() correctly composes the chapter-qualified id and that
// navigations/unreachable-page treats the resolved startPage as having an inbound
// edge even with zero other references to it.
export default function StartPageTarget() {
  return <div>Start</div>
}
