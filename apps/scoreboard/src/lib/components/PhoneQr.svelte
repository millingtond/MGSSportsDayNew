<script lang="ts">
  // Static QR for the public scoreboard URL (pre-generated, error-correction level M) so
  // spectators can scan the big screen and follow live on their own phones. No runtime deps.
  let { caption = 'Follow live on your phone' }: { caption?: string } = $props();
</script>

<div class="phone-qr">
  <svg class="qr" viewBox="0 0 29 29" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="QR code linking to the live scoreboard">
    <path fill="#ffffff" d="M0 0h29v29H0z" />
    <path stroke="#000000" d="M0 0.5h7m3 0h1m1 0h1m2 0h3m2 0h1m1 0h7M0 1.5h1m5 0h1m1 0h1m1 0h2m1 0h2m1 0h1m3 0h1m1 0h1m5 0h1M0 2.5h1m1 0h3m1 0h1m1 0h1m2 0h3m1 0h1m4 0h1m1 0h1m1 0h3m1 0h1M0 3.5h1m1 0h3m1 0h1m1 0h4m4 0h3m3 0h1m1 0h3m1 0h1M0 4.5h1m1 0h3m1 0h1m2 0h3m3 0h2m2 0h1m2 0h1m1 0h3m1 0h1M0 5.5h1m5 0h1m2 0h4m2 0h1m1 0h1m2 0h1m1 0h1m5 0h1M0 6.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7M8 7.5h2m4 0h3m1 0h1m1 0h1M0 8.5h1m5 0h1m1 0h1m1 0h1m1 0h1m4 0h3m1 0h2m2 0h3M1 9.5h1m1 0h2m2 0h1m1 0h1m1 0h3m2 0h1m2 0h3m1 0h2m1 0h2M0 10.5h1m2 0h4m2 0h1m1 0h1m1 0h3m1 0h2m1 0h2m1 0h1M2 11.5h1m4 0h4m2 0h1m4 0h1m5 0h2M0 12.5h1m3 0h1m1 0h3m1 0h4m1 0h1m2 0h1m3 0h1m5 0h1M0 13.5h2m10 0h1m2 0h2m2 0h2m1 0h3m2 0h2M0 14.5h3m2 0h3m1 0h3m3 0h1m4 0h1m1 0h2m1 0h2M2 15.5h1m1 0h2m5 0h2m3 0h1m1 0h1m1 0h2m2 0h1m1 0h1m1 0h1M0 16.5h3m1 0h1m1 0h6m3 0h4m4 0h1m1 0h2M0 17.5h1m1 0h3m2 0h2m1 0h1m1 0h13m1 0h3M0 18.5h4m2 0h1m1 0h1m1 0h2m3 0h1m3 0h4m2 0h1m2 0h1M0 19.5h1m3 0h1m3 0h1m4 0h1m4 0h1m1 0h1m1 0h3M0 20.5h1m2 0h2m1 0h4m4 0h2m1 0h1m2 0h5m1 0h3M8 21.5h1m1 0h3m1 0h2m4 0h1m3 0h2M0 22.5h7m4 0h2m2 0h1m1 0h1m1 0h2m1 0h1m1 0h3M0 23.5h1m5 0h1m5 0h1m1 0h3m2 0h2m3 0h1m3 0h1M0 24.5h1m1 0h3m1 0h1m2 0h3m1 0h2m1 0h1m2 0h7m1 0h2M0 25.5h1m1 0h3m1 0h1m4 0h1m2 0h2m2 0h4m3 0h2m1 0h1M0 26.5h1m1 0h3m1 0h1m2 0h1m2 0h2m1 0h1m6 0h6M0 27.5h1m5 0h1m2 0h5m1 0h2m2 0h1m1 0h6m1 0h1M0 28.5h7m1 0h1m1 0h1m3 0h2m1 0h1m1 0h1m1 0h1m1 0h1m2 0h1" />
  </svg>
  <div class="cap">
    <b>📱 {caption}</b>
    <span>mgssportsday-55624.web.app</span>
  </div>
</div>

<style>
  .phone-qr {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    background: #fff;
    color: #0f172a;
    border-radius: var(--r-lg);
    padding: 0.6rem 0.85rem 0.6rem 0.6rem;
    box-shadow: var(--shadow-lg);
  }
  .qr {
    width: 5.2rem;
    height: 5.2rem;
    flex: none;
    border-radius: 4px;
  }
  .cap {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    line-height: 1.2;
  }
  .cap b {
    font-size: 0.95rem;
    font-weight: 800;
  }
  .cap span {
    font-size: 0.78rem;
    color: #5b6b82;
    font-weight: 600;
  }
</style>
