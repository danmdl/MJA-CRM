import React, { useRef } from 'react';

interface ResizableHeaderProps {
  children: React.ReactNode;
  width: number;
  onResize: (delta: number) => void;
  className?: string;
}

export const ResizableHeader = ({ children, width, onResize, className = '' }: ResizableHeaderProps) => {
  const startX = useRef(0);
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    startX.current = e.clientX;
    const onMove = (ev: MouseEvent) => { onResize(ev.clientX - startX.current); startX.current = ev.clientX; };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };
  return (
    <th className={`relative text-left text-xs font-medium text-muted-foreground px-3 py-2 select-none ${className}`} style={{ width, minWidth: 60 }}>
      {children}
      <div onMouseDown={onMouseDown} className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/30 transition-colors" />
    </th>
  );
};
