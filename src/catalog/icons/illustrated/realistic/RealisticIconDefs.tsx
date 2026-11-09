// Gradients of the realistic device pictures. Mounted once per page (IllustratedIconDefs) so every
// picture can reference them as fill="url(#octetRealistic…)".

export function RealisticIconDefs() {
  return (
    <defs>
      <linearGradient id="octetRealisticDarkTop" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#5b6575" />
        <stop offset="1" stopColor="#3a4250" />
      </linearGradient>
      <linearGradient id="octetRealisticDarkFront" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#2a313c" />
        <stop offset="1" stopColor="#171b22" />
      </linearGradient>
      <linearGradient id="octetRealisticSilverFront" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#c7ccd4" />
        <stop offset="1" stopColor="#8f96a1" />
      </linearGradient>
      <linearGradient id="octetRealisticWhite" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor="#d5dae1" />
      </linearGradient>
      <linearGradient id="octetRealisticWall" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#22d3ee" />
        <stop offset=".5" stopColor="#3b82f6" />
        <stop offset="1" stopColor="#6d28d9" />
      </linearGradient>
      <radialGradient id="octetRealisticGlobe" cx=".35" cy=".3" r=".8">
        <stop offset="0" stopColor="#7dd3fc" />
        <stop offset=".6" stopColor="#0284c7" />
        <stop offset="1" stopColor="#075985" />
      </radialGradient>
      <linearGradient id="octetRealisticRedTop" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fb923c" />
        <stop offset="1" stopColor="#ef4444" />
      </linearGradient>
      <linearGradient id="octetRealisticRedFront" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#dc2626" />
        <stop offset="1" stopColor="#991b1b" />
      </linearGradient>
      <linearGradient id="octetRealisticPlastic" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#efece4" />
        <stop offset="1" stopColor="#d3cdbf" />
      </linearGradient>
      <linearGradient id="octetRealisticGreyFront" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#b8bec7" />
        <stop offset="1" stopColor="#8b929d" />
      </linearGradient>
      <linearGradient id="octetRealisticLcd" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#e0f2fe" />
        <stop offset="1" stopColor="#7dd3fc" />
      </linearGradient>
      <linearGradient id="octetRealisticTvScreen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#1e3a8a" />
        <stop offset=".55" stopColor="#7c3aed" />
        <stop offset="1" stopColor="#f97316" />
      </linearGradient>
    </defs>
  )
}
