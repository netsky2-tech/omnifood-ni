import React from 'react';

interface CursorProps {
  x: number;
  y: number;
  clicked?: boolean;
  visible?: boolean;
}

export const Cursor: React.FC<CursorProps> = ({
  x,
  y,
  clicked = false,
  visible = true,
}) => {
  if (!visible) return null;

  return (
    <div
      className="absolute pointer-events-none z-[100] transition-transform duration-75"
      style={{
        left: x,
        top: y,
        transform: 'translate(-2px, -2px)',
      }}
    >
      {/* SVG del Cursor nativo */}
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-md"
      >
        <path
          d="M5.5 3.5L18.5 13.5H11.5L8.5 20.5L5.5 3.5Z"
          fill="#FF00FF"
          stroke="#FFFFFF"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>

      {/* Efecto de onda al hacer clic */}
      {clicked && (
        <span className="absolute -top-1 -left-1 w-6 h-6 rounded-full bg-[#00BF81]/50 animate-ping pointer-events-none" />
      )}
    </div>
  );
};
