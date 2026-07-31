export default function ActionBar({ appState, startSession, startBlocked, stopSession, stopVaultDrill, resetToIdle }) {
  return (
    <div className="fixed left-0 w-full flex justify-center px-6 z-40 pointer-events-none" style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}>
      {appState==='idle' && (
        <button disabled={startBlocked} className={`pointer-events-auto w-full max-w-md py-5 rounded-2xl text-sm font-black tracking-widest uppercase shadow-xl transition-all ${startBlocked ? 'bg-[#151515] border border-yellow-500/20 text-yellow-400 cursor-not-allowed' : 'bg-white text-black hover:bg-gray-100 active:scale-95'}`} onClick={startSession}>{startBlocked ? 'Resolve Recovered Bars First' : 'Start Session'}</button>
      )}
      {appState==='active' && (
        <button className="pointer-events-auto py-3 px-8 rounded-full text-[10px] font-black tracking-widest uppercase bg-[#0f0f0f] border border-white/10 text-gray-500 hover:text-white hover:bg-white/8 transition-all active:scale-95" onClick={()=>stopSession('global')}>End Session</button>
      )}
      {appState==='vault-drill' && (
        <button className="pointer-events-auto py-3 px-8 rounded-full text-[10px] font-black tracking-widest uppercase bg-[#0f0f0f] border border-yellow-500/20 text-yellow-400 hover:bg-yellow-500/8 transition-all active:scale-95" onClick={stopVaultDrill}>End Drill</button>
      )}
      {appState==='summary' && (
        <button className="pointer-events-auto w-full max-w-md py-5 rounded-2xl text-sm font-black tracking-widest uppercase bg-[#151515] border border-white/8 hover:bg-white/8 transition-all active:scale-95" onClick={resetToIdle}>New Session</button>
      )}
    </div>
  );
}
