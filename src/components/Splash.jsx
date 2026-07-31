// The splash is a brand beat, not a loading screen — there is nothing to wait for,
// since the word banks are bundled and localStorage reads are synchronous. Barsmith's
// whole premise is catching an idea before it goes, so any unskippable gate between
// opening the app and writing is working against the product. Hence: short, and a tap
// anywhere (or any key) gets straight past it.
export default function Splash({ onDismiss }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Skip intro"
      onClick={onDismiss}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDismiss?.(); } }}
      className="fixed inset-0 bg-[#050505] flex items-center justify-center z-[100] cursor-pointer focus:outline-none"
    >
      <img src="/icon-512.png" className="w-40 h-40 object-contain opacity-90" alt="" />
    </div>
  );
}
