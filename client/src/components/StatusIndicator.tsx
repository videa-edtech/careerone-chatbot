interface Props {
  text: string | null;
}

export default function StatusIndicator({ text }: Props) {
    return null;
  // if (!text) return null;
  //
  // return (
  //   <div className="flex items-center justify-center gap-2 px-4 py-1.5 animate-fade-in">
  //     <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-desk-surface/80 border border-desk-border/40 backdrop-blur-sm">
  //       <div className="w-1.5 h-1.5 rounded-full bg-amber-glow animate-pulse" />
  //       <span className="text-xs font-body text-ink-400">{text}</span>
  //     </div>
  //   </div>
  // );
}
