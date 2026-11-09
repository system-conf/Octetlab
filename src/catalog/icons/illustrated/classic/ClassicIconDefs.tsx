// Gradients of the classic network-diagram pictures. Mounted once per page (IllustratedIconDefs);
// the pictures reference them as fill="url(#octetClassic…)".
export function ClassicIconDefs() {
  return (
    <defs>
      <linearGradient id="octetClassicBlueTop" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#6cb4f0" />
        <stop offset="1" stopColor="#3b8ad6" />
      </linearGradient>
      <linearGradient id="octetClassicBlueSide" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#1a5f9e" />
        <stop offset=".45" stopColor="#2b7cc4" />
        <stop offset="1" stopColor="#174f85" />
      </linearGradient>
      <linearGradient id="octetClassicScreen" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#5ba3e8" />
        <stop offset="1" stopColor="#1e4f91" />
      </linearGradient>
      <linearGradient id="octetClassicBeige" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ece8dc" />
        <stop offset="1" stopColor="#cfc8b6" />
      </linearGradient>
      <linearGradient id="octetClassicGrey" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#e5e7eb" />
        <stop offset="1" stopColor="#b9bec7" />
      </linearGradient>
      <radialGradient id="octetClassicCloud" cx=".4" cy=".3" r=".8">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor="#bfdbfe" />
      </radialGradient>
      <linearGradient id="octetClassicWhite" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor="#d5dae1" />
      </linearGradient>
      <linearGradient id="octetClassicBrick" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#e8693f" />
        <stop offset="1" stopColor="#b8391b" />
      </linearGradient>
      <linearGradient id="octetClassicCharcoal" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#5b6472" />
        <stop offset="1" stopColor="#3a414c" />
      </linearGradient>
    </defs>
  )
}
