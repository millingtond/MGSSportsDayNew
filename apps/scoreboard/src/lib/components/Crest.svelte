<script lang="ts">
  // A simple, scalable MGS athletics emblem: a gold winner's medal above a three-step
  // podium (centre tallest). Placeholder for the official school crest — swap the SVG
  // here and it updates everywhere the mark is used.
  let { title = 'MGS Sports Day' }: { title?: string } = $props();
</script>

<svg class="crest" viewBox="0 0 48 48" role="img" aria-label={title} xmlns="http://www.w3.org/2000/svg">
  <circle cx="24" cy="12" r="5.6" fill="#f5b301" />
  <circle cx="24" cy="12" r="2.4" fill="#0a1a33" opacity="0.85" />
  <rect x="8" y="29" width="9.5" height="9" rx="1.7" fill="#f5b301" opacity="0.8" />
  <rect x="19.25" y="22.5" width="9.5" height="15.5" rx="1.7" fill="#f5b301" />
  <rect x="30.5" y="25.5" width="9.5" height="12.5" rx="1.7" fill="#f5b301" opacity="0.8" />
</svg>

<style>
  .crest { width: 76%; height: 76%; display: block; }
</style>
