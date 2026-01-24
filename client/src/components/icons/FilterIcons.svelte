<script lang="ts">
  export let type: string = 'Peaking';
  export let className: string = 'icon';
</script>

{#if type === 'LowPass' || type === 'Lowpass'}
  <svg viewBox="0 0 24 24" class={className} aria-label="Low Pass">
    <path
      d="M3 9 H12 C14 9 15 10 15 12 V20"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
{:else if type === 'HighPass' || type === 'Highpass'}
  <svg viewBox="0 0 24 24" class={className} aria-label="High Pass">
    <path
      d="M3 20 V12 C3 10 4 9 6 9 H21"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
{:else if type === 'BandPass' || type === 'Bandpass'}
  <svg viewBox="0 0 24 24" class={className} aria-label="Band Pass">
    <path
      d="M3 20 V12 C3 10 4 9 6 9 C9 9 9 4 12 4 C15 4 15 9 18 9 C20 9 21 10 21 12 V20"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
{:else if type === 'Notch'}
  <svg viewBox="0 0 24 24" class={className} aria-label="Notch">
    <path
      d="M3 9 H8 C10 9 10 20 12 20 C14 20 14 9 16 9 H21"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
{:else if type === 'LowShelf' || type === 'Lowshelf'}
  <svg viewBox="0 0 24 24" class={className} aria-label="Low Shelf">
    <path
      d="M3 16 H8 C10 16 11 14 11 12 C11 10 12 8 14 8 H21"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
{:else if type === 'HighShelf' || type === 'Highshelf'}
  <svg viewBox="0 0 24 24" class={className} aria-label="High Shelf">
    <path
      d="M3 8 H10 C12 8 13 10 13 12 C13 14 14 16 16 16 H21"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
{:else}
  <!-- Default: Peaking (Bell) -->
  <svg viewBox="0 0 24 24" class={className} aria-label="Peaking">
    <path
      d="M3 12 C7 12 8 6 12 6 C16 6 17 12 21 12"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
{/if}

<style>
  :global(.icon) {
    width: 20px;
    height: 20px;
    color: var(--band-ink);
    opacity: 0.95;
  }

  :global(.band[data-enabled='false'] .icon) {
    opacity: 0.55;
  }
</style>
