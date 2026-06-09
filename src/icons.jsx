// src/icons.jsx
// Icone custom per La Mia Cantina

// Icona placeholder — sostituisci il path SVG con quello dell'icona scelta su Iconify
export const IconaCantina = ({ size = 24, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* PATH DA SOSTITUIRE */}
    <path d="M9 3h6v4l2 3v11H7V10l2-3V3z" />
    <rect x="9" y="3" width="6" height="2" />
    <circle cx="12" cy="14" r="2" />
  </svg>
);
