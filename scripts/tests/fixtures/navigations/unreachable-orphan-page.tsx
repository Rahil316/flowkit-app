// No navigateTo() call, no FlowStory step, and (in the pageOrder-only variant of this
// test) no startPage reference targets this page — proves navigations/unreachable-page
// fires even when the page IS listed in manifest.ts's pageOrder, since pageOrder
// membership is explicitly not treated as a reachability edge.
export default function UnreachableOrphanPage() {
  return <div>Orphan</div>
}
