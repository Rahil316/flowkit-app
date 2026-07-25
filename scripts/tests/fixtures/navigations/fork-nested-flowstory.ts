export default {
  id: 'fork-nested-flowstory',
  name: 'Fork Nested FlowStory',
  steps: [
    {
      pageId: 'TOP_LEVEL_TARGET',
      actionNote: 'top-level step',
      forks: [
        {
          label: 'branch',
          steps: [{ pageId: 'NESTED_FORK_TARGET', actionNote: 'only reachable via this fork' }],
        },
      ],
    },
  ],
}
